import { withProjectJob } from "@/lib/jobs";
import { updateProject, supabaseRest } from "@/lib/projects";
import { validatePaidLine, type PaidLine } from "@/lib/paid-order";
import { shopifyOrderGid } from "@/lib/shopify-webhook";

export type PaidOrderPayload = {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  processed_at?: string | null;
  currency?: string;
  financial_status?: string;
  cancelled_at?: string | null;
  contact_email?: string | null;
  email?: string | null;
  shipping_address?: { first_name?: string | null; last_name?: string | null; city?: string | null } | null;
  line_items?: PaidLine[];
};

/** Applies a verified Shopify paid order. Webhooks and manual reconciliation share this path. */
export async function applyPaidOrder(order: PaidOrderPayload, webhookId: string | null = null, onlyProjectId?: string) {
  const orderId = shopifyOrderGid(order);
  if (!orderId) throw new Error("Missing Shopify order id");
  const grouped = new Map<string, PaidLine[]>();
  for (const line of order.line_items || []) {
    for (const prop of line.properties || []) {
      if (prop.name !== "Project ID" || !prop.value || (onlyProjectId && prop.value !== onlyProjectId)) continue;
      if (!/^[a-f0-9-]{36}$/i.test(prop.value)) throw new Error("Invalid project id in Shopify order");
      grouped.set(prop.value, [...(grouped.get(prop.value) || []), line]);
    }
  }
  if (!grouped.size) throw new Error("Shopify order has no matching POPME project");

  for (const [id, lines] of grouped) {
    await withProjectJob(id, async (project) => {
      if (project.shopify_order_id === orderId && project.paid_at) return;
      if (project.paid_at || project.shopify_order_id) throw new Error("Project reused by another order; investigate payment");
      const holds = await supabaseRest(`shopify_order_holds?order_id=eq.${encodeURIComponent(orderId)}&select=order_id`);
      const problem = project.status !== "CHECKOUT_CREATED" || project.assets_purged_at || project.automation_blocked ? "Project unavailable for payment" :
        order.financial_status !== "paid" || order.cancelled_at || holds?.length ? "Order is not fully paid or is held" : validatePaidLine(project, lines, order.currency);
      await updateProject(id, {
        shopify_order_id: orderId,
        shopify_order_name: order.name || null,
        shopify_webhook_id: webhookId,
        shopify_line_item_id: lines.length === 1 && lines[0].id ? `gid://shopify/LineItem/${lines[0].id}` : null,
        paid_at: order.processed_at || new Date().toISOString(),
        customer_name: [order.shipping_address?.first_name, order.shipping_address?.last_name].filter(Boolean).join(" ") || null,
        customer_email: order.contact_email || order.email || null,
        shipping_city: order.shipping_address?.city || null,
        status: problem ? "BUILD_FAILED" : "PAID_BUILD_STARTING",
        automation_blocked: Boolean(problem),
        last_error: problem,
        next_retry_at: new Date().toISOString(),
        last_operation: problem ? "payment-held" : webhookId ? "payment-validated" : "payment-reconciled",
      });
    }, true);
  }
  return { orderId, projectIds: [...grouped.keys()] };
}
