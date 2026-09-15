import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("Shopify Admin client credentials and webhook setup", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SHOPIFY_STORE_DOMAIN = "popme-test.myshopify.com";
    process.env.SHOPIFY_APP_CLIENT_ID = "client-id";
    process.env.SHOPIFY_APP_CLIENT_SECRET = "client-secret";
    process.env.SHOPIFY_STOREFRONT_API_VERSION = "2026-07";
    process.env.SITE_URL = "https://popme.example";
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("exchanges credentials once and creates only missing subscriptions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short-lived-token", expires_in: 86400 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookSubscriptions: { nodes: [
        { id: "paid", topic: "ORDERS_PAID", uri: "https://popme.example/api/shopify/webhooks/orders-paid" },
      ] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookSubscriptionCreate: { webhookSubscription: { id: "cancelled", topic: "ORDERS_CANCELLED", uri: "https://popme.example/api/shopify/webhooks/orders-cancelled" }, userErrors: [] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { webhookSubscriptionCreate: { webhookSubscription: { id: "refund", topic: "REFUNDS_CREATE", uri: "https://popme.example/api/shopify/webhooks/refunds-create" }, userErrors: [] } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { ensureShopifyWebhooks } = await import("@/lib/shopify-admin");
    await expect(ensureShopifyWebhooks(true)).resolves.toEqual({ created: ["ORDERS_CANCELLED", "REFUNDS_CREATE"], existing: false });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toBe("https://popme-test.myshopify.com/admin/oauth/access_token");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("grant_type=client_credentials");
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(call[1]?.headers).toMatchObject({ "X-Shopify-Access-Token": "short-lived-token" });
    }
  });

  it("does not report configured with an incomplete credential pair", async () => {
    delete process.env.SHOPIFY_APP_CLIENT_SECRET;
    const { shopifyAdminConfigured } = await import("@/lib/shopify-admin");
    expect(shopifyAdminConfigured()).toBe(false);
  });
});
