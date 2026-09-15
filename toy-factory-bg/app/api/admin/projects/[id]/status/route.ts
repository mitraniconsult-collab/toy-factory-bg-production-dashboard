import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getProject, ProjectStatus, updateProject } from "@/lib/projects";
import { MANUAL_PRODUCTION_STATUSES } from "@/lib/status";
import { createShopifyFulfillment, shopifyAdminConfigured } from "@/lib/shopify-admin";
import { withProjectJob, externalOperation } from "@/lib/jobs";

import { ALLOWED_TRANSITIONS } from "@/lib/operations";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const status = String(body?.status || "") as ProjectStatus;

    if (!MANUAL_PRODUCTION_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid production status" }, { status: 400 });
    }

    return await withProjectJob(id, async (current) => {
    if (current.automation_blocked || current.assets_purged_at) return NextResponse.json({ error: "Project requires reconciliation" }, { status: 409 });

    const allowed = ALLOWED_TRANSITIONS[current.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status transition: ${current.status} → ${status}` },
        { status: 409 }
      );
    }

    const trackingNumber = String(body?.trackingNumber || "").trim().slice(0, 250) || null;
    const trackingCompany = String(body?.trackingCompany || "").trim().slice(0, 100) || null;
    if (status === "SHIPPED" && !trackingNumber) return NextResponse.json({ error: "Tracking number is required" }, { status: 400 });

    let project = await updateProject(id, {
      status,
      ...(["SHIPPED", "CANCELLED"].includes(status) ? { closed_at: current.closed_at || new Date().toISOString() } : {}),
      production_notes: String(body?.productionNotes || "").slice(0, 5000) || null,
      tracking_number: trackingNumber,
      tracking_company: trackingCompany,
      last_error: null,
    });

    // Shipping: tell Shopify so the customer gets the tracking email.
    // Never blocks the status save — a Shopify failure is surfaced as last_error.
    let fulfillment: { created: boolean; note: string } | null = null;
    if (status === "SHIPPED" && project && !project.shopify_fulfillment_id) {
      if (!project.shopify_order_id || !project.shopify_line_item_id) {
        fulfillment = { created: false, note: "Проектът няма Shopify поръчка — няма какво да се fulfill-не." };
      } else if (!trackingNumber) {
        fulfillment = { created: false, note: "Няма tracking номер — Shopify fulfillment не е създаден. Добави номера и запази отново." };
      } else if (!shopifyAdminConfigured()) {
        fulfillment = { created: false, note: "SHOPIFY_ADMIN_ACCESS_TOKEN не е зададен — клиентът НЕ е уведомен от Shopify. Маркирай поръчката ръчно в Shopify." };
      } else {
        try {
          const fulfillmentId = await externalOperation(project, "shopify-fulfillment", project.shopify_line_item_id, () => createShopifyFulfillment({
            orderId: project!.shopify_order_id!,
            lineItemId: project!.shopify_line_item_id!,
            trackingNumber,
            trackingCompany,
            notifyCustomer: true,
          }));
          project = (await updateProject(id, { shopify_fulfillment_id: fulfillmentId })) || project;
          fulfillment = { created: true, note: "Shopify fulfillment е създаден. Поискан е имейл; доставката му не е потвърдена." };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Shopify fulfillment failed";
          project = (await updateProject(id, { automation_blocked: true, last_error: `Shopify fulfillment: ${message}` })) || project;
          fulfillment = { created: false, note: message };
        }
      }
    }

    return NextResponse.json({ ok: true, project, fulfillment });
    }, true);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: e instanceof Error && e.message === "UNAUTHORIZED" ? 401 : 500 }
    );
  }
}
