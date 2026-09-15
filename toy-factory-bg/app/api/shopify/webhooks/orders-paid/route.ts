import { NextRequest, NextResponse } from "next/server";
import { applyPaidOrder, type PaidOrderPayload } from "@/lib/shopify-paid";
import { readShopifyWebhookHeaders, shopifyOrderGid, shopifyShopDomainMatches, verifyShopifyWebhook } from "@/lib/shopify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const { hmac, topic, webhookId, shopDomain } = readShopifyWebhookHeaders(request);
  if (!verifyShopifyWebhook(raw, hmac) || !shopifyShopDomainMatches(shopDomain)) return new NextResponse("Invalid webhook", { status: 401 });
  if (topic !== "orders/paid") return new NextResponse("Ignored topic");
  let order: PaidOrderPayload;
  try { order = JSON.parse(raw) as PaidOrderPayload; } catch { return new NextResponse("Invalid JSON", { status: 400 }); }
  const orderId = shopifyOrderGid(order);
  if (!orderId) return new NextResponse("Missing order id", { status: 400 });
  try {
    await applyPaidOrder(order, webhookId);
    return new NextResponse("OK");
  } catch (error) {
    console.error(JSON.stringify({ event: "paid_webhook_retry", orderId, errorType: error instanceof Error ? error.name : "Error" }));
    return new NextResponse("Temporary processing failure", { status: 503 });
  }
}
