import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getProject } from "@/lib/projects";
import { findPaidOrderForProject } from "@/lib/shopify-admin";
import { applyPaidOrder } from "@/lib/shopify-paid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const project = await getProject(id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.paid_at && project.shopify_order_id) return NextResponse.json({ ok: true, alreadyReconciled: true });
    if (project.status !== "CHECKOUT_CREATED") return NextResponse.json({ error: "Only an unpaid checkout can be reconciled" }, { status: 409 });
    const order = await findPaidOrderForProject(id);
    const result = await applyPaidOrder(order, null, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify reconciliation failed";
    console.error(JSON.stringify({ event: "shopify_reconciliation_failed", errorType: error instanceof Error ? error.name : "Error" }));
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
