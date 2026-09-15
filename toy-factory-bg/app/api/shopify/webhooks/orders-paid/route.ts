import { NextRequest, NextResponse } from "next/server";
import { withProjectJob } from "@/lib/jobs";
import { updateProject, supabaseRest } from "@/lib/projects";
import { validatePaidLine, type PaidLine } from "@/lib/paid-order";
import { readShopifyWebhookHeaders, shopifyOrderGid, shopifyShopDomainMatches, verifyShopifyWebhook } from "@/lib/shopify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const { hmac, topic, webhookId, shopDomain } = readShopifyWebhookHeaders(request);
  if (!verifyShopifyWebhook(raw, hmac) || !shopifyShopDomainMatches(shopDomain)) return new NextResponse("Invalid webhook", { status: 401 });
  if (topic !== "orders/paid") return new NextResponse("Ignored topic");
  let order;
  try { order = JSON.parse(raw); } catch { return new NextResponse("Invalid JSON", { status: 400 }); }
  const orderId = shopifyOrderGid(order);
  if (!orderId) return new NextResponse("Missing order id", { status: 400 });
  const grouped = new Map<string, PaidLine[]>();
  for (const line of (order.line_items || []) as PaidLine[]) {
    for (const prop of line.properties || []) {
      if (prop.name !== "Project ID" || !prop.value) continue;
      if (!/^[a-f0-9-]{36}$/i.test(prop.value)) return new NextResponse("Invalid project", { status: 400 });
      grouped.set(prop.value, [...(grouped.get(prop.value) || []), line]);
    }
  }
  try {
    for (const [id, lines] of grouped) {
      await withProjectJob(id, async (p) => {
        if (p.shopify_order_id === orderId && p.paid_at) return; // delivery replay
        if (p.paid_at || p.shopify_order_id) throw new Error("Project reused by another order; investigate payment");
        const holds = await supabaseRest(`shopify_order_holds?order_id=eq.${encodeURIComponent(orderId)}&select=order_id`);
        const problem = p.status !== "CHECKOUT_CREATED" || p.assets_purged_at || p.automation_blocked ? "Project unavailable for payment" :
          order.financial_status !== "paid" || order.cancelled_at || holds?.length ? "Order is not fully paid or is held" : validatePaidLine(p, lines, order.currency);
        await updateProject(id, {
          shopify_order_id: orderId, shopify_order_name: order.name || null, shopify_webhook_id: webhookId || null,
          shopify_line_item_id: lines.length === 1 && lines[0].id ? `gid://shopify/LineItem/${lines[0].id}` : null,
          paid_at: order.processed_at || new Date().toISOString(),
          customer_name: [order.shipping_address?.first_name, order.shipping_address?.last_name].filter(Boolean).join(" ") || null,
          customer_email: order.contact_email || order.email || null, shipping_city: order.shipping_address?.city || null,
          status: problem ? "BUILD_FAILED" : "PAID_BUILD_STARTING", automation_blocked: Boolean(problem), last_error: problem,
          next_retry_at: new Date().toISOString(), last_operation: problem ? "payment-held" : "payment-validated",
        });
      }, true);
    }
    return new NextResponse("OK");
  } catch (error) {
    console.error(JSON.stringify({ event: "paid_webhook_retry", orderId, errorType: error instanceof Error ? error.name : "Error" }));
    return new NextResponse("Temporary processing failure", { status: 503 });
  }
}
