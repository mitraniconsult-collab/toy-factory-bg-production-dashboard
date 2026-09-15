import { NextRequest, NextResponse } from "next/server";
import { listProjectsByOrderId, ProjectStatus, updateProject, supabaseRest } from "@/lib/projects";
import { withProjectJob } from "@/lib/jobs";
import {
  readShopifyWebhookHeaders,
  shopifyOrderGid,
  shopifyShopDomainMatches,
  verifyShopifyWebhook,
} from "@/lib/shopify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Handles `orders/cancelled` and `refunds/create`.
 *
 * - Cancellation before physical production → project becomes CANCELLED so the
 *   cron/webhook sync stops driving it and no more Meshy credits are spent.
 * - Cancellation once printing has started → status is kept, project is
 *   flagged in `last_error` for the operator.
 * - Refunds never auto-cancel (a partial refund for shipping must not stop a
 *   print); they only flag the project.
 *
 * Register both topics in Shopify pointing to this URL.
 */

const HANDLED_TOPICS = new Set(["orders/cancelled", "refunds/create"]);

/** Statuses where nothing physical exists yet and cancelling is safe. */
const PRE_PRODUCTION_STATUSES = new Set<ProjectStatus>([
  "CHECKOUT_CREATED",
  "CHECKOUT_FAILED",
  "PAID_BUILD_STARTING",
  "BUILD_SUBMITTING",
  "3D_GENERATING",
  "BUILD_FAILED",
  "MODEL_RESIZE_SUBMITTING",
  "MODEL_RESIZING",
  "PRINT_FILE_SUBMITTING",
  "PRINT_FILE_GENERATING",
  "PRINT_FILE_FAILED",
  "READY_FOR_PRINT",
]);

type CancelledOrder = {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
};

type RefundPayload = {
  id?: number | string;
  order_id?: number | string;
  note?: string | null;
  transactions?: { amount?: string; currency?: string; kind?: string }[];
};

function refundAmount(refund: RefundPayload) {
  const total = (refund.transactions || [])
    .filter((t) => t.kind === "refund")
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const currency = refund.transactions?.find((t) => t.currency)?.currency || "";
  return total ? `${total.toFixed(2)} ${currency}`.trim() : null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const { hmac, topic, webhookId, shopDomain } = readShopifyWebhookHeaders(request);

  if (!verifyShopifyWebhook(rawBody, hmac)) return new NextResponse("Invalid webhook signature", { status: 401 });
  if (!shopifyShopDomainMatches(shopDomain)) return new NextResponse("Unknown shop domain", { status: 401 });
  if (!topic || !HANDLED_TOPICS.has(topic)) return new NextResponse("Ignored topic", { status: 200 });

  let payload: CancelledOrder & RefundPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const isRefund = topic === "refunds/create";
  const orderId = isRefund
    ? shopifyOrderGid({ id: payload.order_id })
    : shopifyOrderGid(payload);
  if (!orderId) return new NextResponse("No order id", { status: 200 });

  // Persist even when cancellation/refund arrives before orders/paid.
  await supabaseRest("shopify_order_holds?on_conflict=order_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ order_id: orderId, reason: topic }) });
  const projects = await listProjectsByOrderId(orderId);
  if (!projects.length) return new NextResponse("No toy projects for order", { status: 200 });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const results: { projectId: string; from: ProjectStatus; to: ProjectStatus; note: string }[] = [];

  for (const snapshot of projects) {
    await withProjectJob(snapshot.id, async (project) => {
    // Idempotency: the same webhook delivery may be retried by Shopify.
    if (project.shopify_webhook_id && webhookId && project.shopify_webhook_id === webhookId) {
      results.push({ projectId: project.id, from: project.status, to: project.status, note: "duplicate delivery" });
      return;
    }

    let note: string;
    let nextStatus: ProjectStatus = project.status;

    if (isRefund) {
      const amount = refundAmount(payload);
      note = `Refund ${amount ? `(${amount}) ` : ""}получен в Shopify на ${stamp}. Провери поръчката преди да продължиш.`;
    } else if (project.status === "CANCELLED") {
      note = "already cancelled";
    } else if (PRE_PRODUCTION_STATUSES.has(project.status)) {
      nextStatus = "CANCELLED";
      note = `Поръчката е отказана в Shopify на ${stamp}${payload.cancel_reason ? ` (${payload.cancel_reason})` : ""}. Спряна преди печат.`;
    } else {
      note = `ВНИМАНИЕ: поръчката е отказана в Shopify на ${stamp}, но продукцията вече е започнала (${project.status}). Ръчно решение.`;
    }

    if (note !== "already cancelled") {
      await updateProject(project.id, {
        status: nextStatus,
        automation_blocked: true,
        ...(nextStatus === "CANCELLED" ? { closed_at: new Date().toISOString() } : {}),
        last_error: note,
        shopify_webhook_id: webhookId || project.shopify_webhook_id || null,
      });
    }

    results.push({ projectId: project.id, from: project.status, to: nextStatus, note });
    }, true);
  }

  console.info(`shopify ${topic}`, { order: payload.name || orderId, results });
  return NextResponse.json({ ok: true, topic, results });
}
