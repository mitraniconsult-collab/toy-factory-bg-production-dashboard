/**
 * Shopify Admin API (GraphQL). Used only to create the fulfillment when a
 * figure ships, so Shopify emails the customer the tracking number.
 *
 * Env:
 *   SHOPIFY_ADMIN_ACCESS_TOKEN - Admin API token from a custom app with
 *                                `read_orders`, `write_fulfillments` scopes.
 *   SHOPIFY_ADMIN_API_VERSION  - optional, defaults to the Storefront version.
 */

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || process.env.SHOPIFY_STOREFRONT_API_VERSION || "2026-07";

type AdminResponse<T> = { data?: T; errors?: Array<{ message: string }> };

function shopDomain() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is missing on the server.");
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
}

export function shopifyAdminConfigured() {
  return Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN && process.env.SHOPIFY_STORE_DOMAIN);
}

async function adminGraphql<T>(query: string, variables: Record<string, unknown>) {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is missing on the server.");

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
