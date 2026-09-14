import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyShopifyWebhook, shopifyShopDomainMatches } from "@/lib/shopify-webhook";
import { consumeRateLimit } from "@/lib/rate-limit";
import { signAssetAccess, verifyAssetAccess } from "@/lib/asset-access";

describe("server boundaries", () => {
  it("authenticates exact raw webhook bytes and rejects tampering", () => {
    const raw = '{"id":1}';
    const signature = createHmac("sha256", "test-webhook-secret").update(raw).digest("base64");
    expect(verifyShopifyWebhook(raw, signature)).toBe(true);
    expect(verifyShopifyWebhook(raw + " ", signature)).toBe(false);
    expect(verifyShopifyWebhook(raw, null)).toBe(false);
    expect(shopifyShopDomainMatches("other.myshopify.com")).toBe(false);
  });
  it("binds temporary file access to path and expiration", () => {
    vi.stubEnv("ASSET_PROXY_SECRET", "test-asset-secret");
    const token = signAssetAccess("project/model.glb");
    expect(verifyAssetAccess("project/model.glb", token.expiresAt, token.signature)).toBe(true);
    expect(verifyAssetAccess("other/model.glb", token.expiresAt, token.signature)).toBe(false);
    expect(verifyAssetAccess("project/model.glb", 1, token.signature)).toBe(false);
  });
  it.each([true, false])("preserves rate limit allowed=%s", async (allowed) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([{ allowed, remaining: allowed ? 2 : 0, reset_at: "2026-10-01T00:00:00Z" }])));
    const result = await consumeRateLimit({ scope: "test", key: "hash", windowSeconds: 60, limit: 3 });
    expect(result.allowed).toBe(allowed);
    expect(result.remaining).toBe(allowed ? 2 : 0);
  });
  it("fails closed on a broken rate limit response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}"));
    await expect(consumeRateLimit({ scope: "test", key: "hash", windowSeconds: 60, limit: 3 })).rejects.toThrow();
  });
});
