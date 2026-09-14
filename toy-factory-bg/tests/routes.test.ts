import { it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
vi.mock("@/lib/production", () => ({ syncProject: vi.fn() }));
vi.mock("@/lib/projects", () => ({ claimProjectForPaidOrder: vi.fn(), updateProject: vi.fn(), createProject: vi.fn() }));
vi.mock("@/lib/meshy", () => ({ getTask: vi.fn() }));
vi.mock("@/lib/shopify", () => ({ createToyCheckout: vi.fn() }));
vi.mock("@/lib/storage", () => ({ archiveRemoteAsset: vi.fn() }));
import { POST as paid } from "@/app/api/shopify/webhooks/orders-paid/route";
import { POST as checkout } from "@/app/api/shopify/checkout/route";
import { claimProjectForPaidOrder, updateProject } from "@/lib/projects";
import { syncProject } from "@/lib/production";
import { createToyCheckout } from "@/lib/shopify";
import { project } from "./fixtures";

function order(quantity: number) {
  const body = JSON.stringify({ id: 1, financial_status: "paid", line_items: [{ quantity, properties: [{ name: "Project ID", value: project().id }] }] });
  return new NextRequest("https://local.invalid/api/shopify/webhooks/orders-paid", { method: "POST", body, headers: { "x-shopify-shop-domain": "toy-test.myshopify.com", "x-shopify-topic": "orders/paid", "x-shopify-hmac-sha256": createHmac("sha256", "test-webhook-secret").update(body).digest("base64") } });
}
it("does not restart production on duplicate paid events", async () => {
  vi.mocked(claimProjectForPaidOrder).mockResolvedValue(null);
  expect((await paid(order(1))).status).toBe(200);
  expect(syncProject).not.toHaveBeenCalled();
});
it("parks quantity mismatch instead of spending credits", async () => {
  vi.mocked(claimProjectForPaidOrder).mockResolvedValue(project({ status: "PAID_BUILD_STARTING" }));
  await paid(order(2));
  expect(updateProject).toHaveBeenCalledWith(project().id, expect.objectContaining({ status: "BUILD_FAILED" }));
  expect(syncProject).not.toHaveBeenCalled();
});
it("rejects an invalid checkout size before calling Shopify", async () => {
  const response = await checkout(new NextRequest("https://local.invalid/api/shopify/checkout", { method: "POST", body: JSON.stringify({ prototypeTaskId: "prototype", size: "100", modelKind: "pop" }) }));
  expect(response.status).toBe(400);
  expect(createToyCheckout).not.toHaveBeenCalled();
});
