import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/** Shared verification for every Shopify webhook route. */

export function verifyShopifyWebhook(rawBody: string, providedHmac: string | null) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_APP_CLIENT_SECRET;
  if (!secret || !providedHmac) return false;

  const computed = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  const providedBuffer = Buffer.from(providedHmac, "utf8");
  const computedBuffer = Buffer.from(computed, "utf8");
  if (providedBuffer.length !== computedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, computedBuffer);
}

function normalizeShopDomain(value: string) {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0].toLowerCase();
}

export function shopifyShopDomainMatches(provided: string | null) {
  const expected = process.env.SHOPIFY_STORE_DOMAIN;
  // If the store domain is not configured we cannot verify it; HMAC still protects us.
  if (!expected) return false;
  if (!provided) return false;
  return normalizeShopDomain(provided) === normalizeShopDomain(expected);
}

export type ShopifyWebhookHeaders = {
  hmac: string | null;
  topic: string | null;
  webhookId: string | null;
  shopDomain: string | null;
};

export function readShopifyWebhookHeaders(request: NextRequest): ShopifyWebhookHeaders {
  return {
    hmac: request.headers.get("x-shopify-hmac-sha256"),
    topic: request.headers.get("x-shopify-topic"),
    webhookId: request.headers.get("x-shopify-webhook-id"),
    shopDomain: request.headers.get("x-shopify-shop-domain"),
  };
}

/** Builds the GraphQL order GID from either form Shopify sends in webhooks. */
export function shopifyOrderGid(order: { admin_graphql_api_id?: string; id?: number | string }) {
  if (order.admin_graphql_api_id) return order.admin_graphql_api_id;
  return order.id ? `gid://shopify/Order/${String(order.id)}` : null;
}
