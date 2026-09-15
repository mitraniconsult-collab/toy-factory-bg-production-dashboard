/**
 * Shopify Admin API (GraphQL). Used only to create the fulfillment when a
 * figure ships, so Shopify emails the customer the tracking number.
 *
 * Env:
 *   SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET - Dev Dashboard app
 *   credentials. The short-lived Admin token is obtained server-side.
 *   SHOPIFY_ADMIN_ACCESS_TOKEN remains a legacy fallback.
 *   SHOPIFY_ADMIN_API_VERSION  - optional, defaults to the Storefront version.
 */

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || process.env.SHOPIFY_STOREFRONT_API_VERSION || "2026-07";

type AdminResponse<T> = { data?: T; errors?: Array<{ message: string }> };
let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let webhooksEnsuredAt = 0;

function shopDomain() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is missing on the server.");
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
}

export function shopifyAdminConfigured() {
  const hasToken = Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN);
  const hasClientCredentials = Boolean(process.env.SHOPIFY_APP_CLIENT_ID && process.env.SHOPIFY_APP_CLIENT_SECRET);
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && (hasToken || hasClientCredentials));
}

async function adminAccessToken() {
  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;

  const clientId = process.env.SHOPIFY_APP_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify Admin credentials are missing on the server.");

  const response = await fetch(`https://${shopDomain()}/admin/oauth/access_token`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !json.access_token) throw new Error(`Shopify token exchange failed (${response.status}).`);
  cachedAccessToken = { value: json.access_token, expiresAt: Date.now() + Math.max(60, json.expires_in || 86_400) * 1000 };
  return cachedAccessToken.value;
}

export async function adminGraphql<T>(query: string, variables: Record<string, unknown> = {}) {
  const token = await adminAccessToken();

  const response = await fetch(`https://${shopDomain()}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as AdminResponse<T>;
  if (!response.ok) throw new Error(`Shopify Admin API ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
  if (json.errors?.length) throw new Error(`Shopify Admin API: ${json.errors.map((e) => e.message).join("; ")}`);
  if (!json.data) throw new Error("Shopify Admin API returned no data.");
  return json.data;
}

const WEBHOOKS_QUERY = `#graphql
query ExistingWebhooks {
  webhookSubscriptions(first: 100) { nodes { id topic uri } }
}`;

const WEBHOOK_CREATE_MUTATION = `#graphql
mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id topic uri }
    userErrors { field message }
  }
}`;

type WebhookTopic = "ORDERS_PAID" | "ORDERS_CANCELLED" | "REFUNDS_CREATE";
type WebhookListData = { webhookSubscriptions: { nodes: Array<{ id: string; topic: string; uri: string }> } };
type WebhookCreateData = { webhookSubscriptionCreate: { webhookSubscription: { id: string; topic: string; uri: string } | null; userErrors: Array<{ message: string }> } };

/** Idempotently provisions the app-owned HTTPS subscriptions. */
export async function ensureShopifyWebhooks(force = false) {
  if (!shopifyAdminConfigured()) throw new Error("Shopify Admin API is not configured.");
  if (!force && Date.now() - webhooksEnsuredAt < 60 * 60 * 1000) return { created: [], existing: true };
  const base = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("A public HTTPS SITE_URL is required for Shopify webhooks.");
  const desired: Array<{ topic: WebhookTopic; uri: string }> = [
    { topic: "ORDERS_PAID", uri: `${base}/api/shopify/webhooks/orders-paid` },
    { topic: "ORDERS_CANCELLED", uri: `${base}/api/shopify/webhooks/orders-cancelled` },
    { topic: "REFUNDS_CREATE", uri: `${base}/api/shopify/webhooks/refunds-create` },
  ];
  const current = await adminGraphql<WebhookListData>(WEBHOOKS_QUERY);
  const created: string[] = [];
  for (const item of desired) {
    if (current.webhookSubscriptions.nodes.some((node) => node.topic === item.topic && node.uri === item.uri)) continue;
    const result = await adminGraphql<WebhookCreateData>(WEBHOOK_CREATE_MUTATION, {
      topic: item.topic,
      webhookSubscription: { uri: item.uri },
    });
    const errors = result.webhookSubscriptionCreate.userErrors;
    if (errors.length || !result.webhookSubscriptionCreate.webhookSubscription) {
      throw new Error(`Shopify webhook ${item.topic}: ${errors.map((error) => error.message).join("; ") || "not created"}`);
    }
    created.push(item.topic);
  }
  webhooksEnsuredAt = Date.now();
  return { created, existing: created.length === 0 };
}

const RECENT_PAID_ORDERS_QUERY = `#graphql
query RecentPaidOrders($query: String!) {
  orders(first: 50, sortKey: CREATED_AT, reverse: true, query: $query) {
    nodes {
      id name processedAt currencyCode displayFinancialStatus cancelledAt email
      shippingAddress { firstName lastName city }
      lineItems(first: 50) {
        pageInfo { hasNextPage }
        nodes {
          id quantity variant { id }
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          discountAllocations { allocatedAmountSet { shopMoney { amount currencyCode } } }
          customAttributes { key value }
        }
      }
    }
  }
}`;

type AdminOrder = {
  id: string; name: string; processedAt: string | null; currencyCode: string; displayFinancialStatus: string; cancelledAt: string | null; email: string | null;
  shippingAddress: { firstName?: string | null; lastName?: string | null; city?: string | null } | null;
  lineItems: { pageInfo: { hasNextPage: boolean }; nodes: Array<{ id: string; quantity: number; variant: { id: string } | null; originalUnitPriceSet: { shopMoney: { amount: string; currencyCode: string } }; discountAllocations: Array<{ allocatedAmountSet: { shopMoney: { amount: string; currencyCode: string } } }>; customAttributes: Array<{ key: string; value: string }> }> };
};

export async function findPaidOrderForProject(projectId: string) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const data = await adminGraphql<{ orders: { nodes: AdminOrder[] } }>(RECENT_PAID_ORDERS_QUERY, { query: `financial_status:paid created_at:>=${since}` });
  const matches = data.orders.nodes.filter((order) => order.lineItems.nodes.some((line) => line.customAttributes.some((attribute) => attribute.key === "Project ID" && attribute.value === projectId)));
  if (matches.length !== 1) throw new Error(matches.length ? "Multiple Shopify orders reference this project." : "No recent paid Shopify order references this project.");
  const order = matches[0];
  if (order.lineItems.pageInfo.hasNextPage) throw new Error("Large Shopify order requires manual reconciliation.");
  return {
    admin_graphql_api_id: order.id,
    name: order.name,
    processed_at: order.processedAt,
    currency: order.currencyCode,
    financial_status: order.displayFinancialStatus.toLowerCase() === "paid" ? "paid" : order.displayFinancialStatus.toLowerCase(),
    cancelled_at: order.cancelledAt,
    contact_email: order.email,
    shipping_address: order.shippingAddress ? { first_name: order.shippingAddress.firstName, last_name: order.shippingAddress.lastName, city: order.shippingAddress.city } : null,
    line_items: order.lineItems.nodes.map((line) => ({
      id: line.id.split("/").pop(),
      variant_id: line.variant?.id.split("/").pop(),
      quantity: line.quantity,
      price: line.originalUnitPriceSet.shopMoney.amount,
      discount_allocations: line.discountAllocations.map((discount) => ({ amount: discount.allocatedAmountSet.shopMoney.amount })),
      properties: line.customAttributes.map((attribute) => ({ name: attribute.key, value: attribute.value })),
    })),
  };
}

const FULFILLMENT_ORDERS_QUERY = `#graphql
query OrderFulfillmentOrders($id: ID!) {
  order(id: $id) {
    id
    name
    fulfillmentOrders(first: 100) {
      pageInfo { hasNextPage }
      nodes { id status lineItems(first: 100) { pageInfo { hasNextPage } nodes { id remainingQuantity lineItem { id } } } }
    }
  }
}`;

const FULFILLMENT_CREATE_MUTATION = `#graphql
mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id status trackingInfo { number company url } }
    userErrors { field message }
  }
}`;

type FulfillmentOrdersData = {
  order: { id: string; name: string; fulfillmentOrders: { pageInfo: { hasNextPage: boolean }; nodes: Array<{ id: string; status: string; lineItems: { pageInfo: { hasNextPage: boolean }; nodes: Array<{ id: string; remainingQuantity: number; lineItem: { id: string } }> } }> } } | null;
};
type FulfillmentCreateData = {
  fulfillmentCreate: {
    fulfillment: { id: string; status: string } | null;
    userErrors: Array<{ field?: string[] | null; message: string }>;
  };
};

/**
 * Fulfills only the validated project line. Requests notification; delivery
 * of the customer's email is not observable from this response.
 */
export async function createShopifyFulfillment(input: {
  orderId: string;
  lineItemId: string;
  trackingNumber: string;
  trackingCompany?: string | null;
  notifyCustomer?: boolean;
}) {
  const data = await adminGraphql<FulfillmentOrdersData>(FULFILLMENT_ORDERS_QUERY, { id: input.orderId });
  if (!data.order) throw new Error(`Shopify order ${input.orderId} not found via Admin API.`);
  if (data.order.fulfillmentOrders.pageInfo.hasNextPage || data.order.fulfillmentOrders.nodes.some((fo) => fo.lineItems.pageInfo.hasNextPage)) throw new Error("Large order requires manual fulfillment review");

  const open = data.order.fulfillmentOrders.nodes.filter((fo) => fo.status === "OPEN" || fo.status === "IN_PROGRESS");
  if (!open.length) {
    throw new Error(`Shopify order ${data.order.name} has no open fulfillment orders (already fulfilled or cancelled).`);
  }
  const matches = open.flatMap((fo) => fo.lineItems.nodes.filter((line) => line.lineItem.id === input.lineItemId && line.remainingQuantity === 1).map((line) => ({ fulfillmentOrderId: fo.id, fulfillmentOrderLineItems: [{ id: line.id, quantity: 1 }] })));
  if (matches.length !== 1) throw new Error("Project line is unavailable or already fulfilled; reconcile in Shopify");

  const result = await adminGraphql<FulfillmentCreateData>(FULFILLMENT_CREATE_MUTATION, {
    fulfillment: {
      lineItemsByFulfillmentOrder: matches,
      trackingInfo: {
        number: input.trackingNumber,
        ...(input.trackingCompany ? { company: input.trackingCompany } : {}),
      },
      notifyCustomer: input.notifyCustomer ?? true,
    },
  });

  const errors = result.fulfillmentCreate.userErrors;
  if (errors.length) throw new Error(`Shopify fulfillment: ${errors.map((e) => e.message).join("; ")}`);
  if (!result.fulfillmentCreate.fulfillment) throw new Error("Shopify returned no fulfillment.");
  return result.fulfillmentCreate.fulfillment.id;
}
