import { projectFence, jobContext } from "@/lib/job-context";
export type ModelKind = "pop" | "mini" | "brick";

export function isModelKind(value: unknown): value is ModelKind {
  return value === "pop" || value === "mini" || value === "brick";
}

export type ProjectStatus =
  | "CHECKOUT_CREATED"
  | "CHECKOUT_FAILED"
  | "PAID_BUILD_STARTING"
  | "BUILD_SUBMITTING"
  | "3D_GENERATING"
  | "BUILD_FAILED"
  | "MODEL_RESIZE_SUBMITTING"
  | "MODEL_RESIZING"
  | "PRINT_FILE_SUBMITTING"
  | "PRINT_FILE_GENERATING"
  | "PRINT_FILE_FAILED"
  | "READY_FOR_PRINT"
  | "PRINTING"
  | "PRINTED"
  | "PACKED"
  | "SHIPPED"
  | "CANCELLED";

export const PROJECT_STATUSES: ProjectStatus[] = [
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
  "PRINTING",
  "PRINTED",
  "PACKED",
  "SHIPPED",
  "CANCELLED",
];

export type ToyProject = {
  id: string;
  created_at?: string;
  updated_at?: string;
  model_kind: ModelKind;
  prototype_task_id: string;
  preview_url: string | null;
  preview_storage_path?: string | null;
  size_cm: number;
  price_eur: number;
  status: ProjectStatus;
  shopify_cart_id?: string | null;
  shopify_order_id?: string | null;
  shopify_order_name?: string | null;
  shopify_webhook_id?: string | null;
  paid_at?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  shipping_city?: string | null;
  build_task_id?: string | null;
  resize_task_id?: string | null;
  print_task_id?: string | null;
  glb_url?: string | null;
  glb_storage_path?: string | null;
  three_mf_url?: string | null;
  three_mf_storage_path?: string | null;
  production_notes?: string | null;
  tracking_number?: string | null;
  tracking_company?: string | null;
  shopify_fulfillment_id?: string | null;
  alert_sent_at?: string | null;
  /** Bambu filament palette (hex) extracted from the print 3MF, slot 1..N. */
  print_palette?: string[] | null;
  /** Set once the generated files have been deleted by the retention job. */
  assets_purged_at?: string | null;
  last_error?: string | null;
  job_id?: string | null;
  lease_token?: string | null;
  lease_until?: string | null;
  job_attempts?: number;
  retry_count?: number;
  next_retry_at?: string;
  last_operation?: string | null;
  automation_blocked?: boolean;
  expected_variant_id?: string | null;
  shopify_line_item_id?: string | null;
  checkout_url?: string | null;
  closed_at?: string | null;
  alert_attempts?: number;
  alert_next_retry_at?: string;
  status_changed_at?: string;
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on the server.");
  }
  return { url, key };
}

export async function supabaseRest(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    signal: init.signal || AbortSignal.timeout(10_000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body?.message || body?.details || body?.hint || `Supabase request failed with ${response.status}`;
    throw new Error(String(message));
  }
  return body;
}

export async function createProject(project: ToyProject) {
  const rows = (await supabaseRest("toy_projects", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(project),
  })) as ToyProject[];
  if (!rows?.[0]) throw new Error("Supabase did not return the created project.");
  return rows[0];
}

export async function updateProject(id: string, patch: Partial<ToyProject>): Promise<ToyProject | null> {
  // Clearing the error re-arms the watchdog so the next failure alerts again.
  const rearm = patch.last_error === null && patch.alert_sent_at === undefined ? { alert_sent_at: null } : {};
  const rows = (await supabaseRest(`toy_projects?id=eq.${encodeURIComponent(id)}${projectFence(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, ...rearm, updated_at: new Date().toISOString() }),
  })) as ToyProject[];
  if (!rows?.[0] && jobContext.getStore()?.projectId === id) throw new Error("Project lease lost");
  return rows?.[0] || null;
}

/**
 * Atomically claims a production transition by updating only when the project
 * is still in the expected status. Concurrent webhook/manual sync calls will
 * therefore have exactly one winner before an external Meshy task is created.
 */
export async function claimProjectTransition(
  id: string,
  fromStatus: ProjectStatus,
  toStatus: ProjectStatus,
  patch: Partial<ToyProject> = {}
): Promise<ToyProject | null> {
  const path = `toy_projects?id=eq.${encodeURIComponent(id)}&status=eq.${encodeURIComponent(fromStatus)}${projectFence(id)}`;
  const rows = (await supabaseRest(path, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...patch,
      status: toStatus,
      updated_at: new Date().toISOString(),
    }),
  })) as ToyProject[];
  return rows?.[0] || null;
}

export async function getProject(id: string): Promise<ToyProject | null> {
  const rows = (await supabaseRest(`toy_projects?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "GET",
  })) as ToyProject[];
  return rows?.[0] || null;
}

/** Projects with an un-alerted error, or stuck in an automated stage past `staleBefore`. */
export async function listProjectsNeedingAlert(input: { staleStatuses: ProjectStatus[]; staleBefore: string }) {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("alert_sent_at", "is.null");
  params.set("alert_next_retry_at", `lte.${new Date().toISOString()}`);
  params.set(
    "or",
    `(last_error.not.is.null,and(status.in.(${input.staleStatuses.join(",")}),status_changed_at.lt.${input.staleBefore}))`
  );
  params.set("order", "updated_at.asc");
  params.set("limit", "1");
  return (await supabaseRest(`toy_projects?${params.toString()}`, { method: "GET" })) as ToyProject[];
}

/** Projects whose generated files are past their retention window. */
export async function listProjectsForRetention(input: {
  unpaidStatuses: ProjectStatus[];
  unpaidBefore: string;
  closedStatuses: ProjectStatus[];
  closedBefore: string;
  limit: number;
}) {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("assets_purged_at", "is.null");
  params.set(
    "or",
    `(and(status.in.(${input.unpaidStatuses.join(",")}),created_at.lt.${input.unpaidBefore}),` +
      `and(status.in.(${input.closedStatuses.join(",")}),closed_at.lt.${input.closedBefore}),` +
      `and(status.in.(${input.closedStatuses.join(",")}),closed_at.is.null,updated_at.lt.${input.closedBefore}))`
  );
  params.set("order", "updated_at.asc");
  params.set("limit", String(input.limit));
  return (await supabaseRest(`toy_projects?${params.toString()}`, { method: "GET" })) as ToyProject[];
}

/** Hard-deletes a project row. Only for GDPR erasure requests. */
export async function deleteProjectRow(id: string) {
  await supabaseRest(`toy_projects?id=eq.${encodeURIComponent(id)}${projectFence(id)}`, { method: "DELETE" });
}

export async function listProjectsByOrderId(orderId: string) {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("shopify_order_id", `eq.${orderId}`);
  return (await supabaseRest(`toy_projects?${params.toString()}`, { method: "GET" })) as ToyProject[];
}

export async function findProjectByTaskId(taskId: string) {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set(
    "or",
    `(prototype_task_id.eq.${taskId},build_task_id.eq.${taskId},resize_task_id.eq.${taskId},print_task_id.eq.${taskId})`
  );
  params.set("limit", "1");
  const rows = (await supabaseRest(`toy_projects?${params.toString()}`, { method: "GET" })) as ToyProject[];
  return rows?.[0] || null;
}

export async function listProjects(input: { status?: ProjectStatus; statuses?: ProjectStatus[]; q?: string; limit?: number; page?: number; style?: string; size?: string; from?: string; to?: string; issue?: string } = {}) {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("order", "created_at.desc");
  params.set("limit", "26"); // one look-ahead row, never sampled dashboard totals
  params.set("offset", String((Math.max(1, Math.min(100000, input.page || 1)) - 1) * 25));
  if (input.status) params.set("status", `eq.${input.status}`);
  else if (input.statuses) params.set("status", `in.(${input.statuses.join(",")})`);
  if (input.style && ["pop", "mini", "brick"].includes(input.style)) params.set("model_kind", `eq.${input.style}`);
  if (input.size && ["10", "15", "20"].includes(input.size)) params.set("size_cm", `eq.${input.size}`);
  const and: string[] = [];
  if (input.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from)) and.push(`created_at.gte.${input.from}T00:00:00Z`);
  if (input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to)) and.push(`created_at.lte.${input.to}T23:59:59.999Z`);
  if (input.issue === "any") and.push("or(last_error.not.is.null,automation_blocked.eq.true)");
  if (input.issue === "held") params.set("automation_blocked", "eq.true");
  if (input.issue === "retry") params.set("retry_count", "gt.0");
  if (input.q?.trim()) {
    const q = input.q.trim().replace(/[^\p{L}\p{N}@. _-]/gu, "").slice(0, 150);
    const filters = [
      `shopify_order_name.ilike.*${q}*`,
      `customer_name.ilike.*${q}*`,
      `customer_email.ilike.*${q}*`,
    ];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q)) {
      filters.push(`id.eq.${q}`);
    }
    and.push(`or(${filters.join(",")})`);
  }
  if (and.length) params.set("and", `(${and.join(",")})`);
  return (await supabaseRest(`toy_projects?${params.toString()}`, { method: "GET" })) as ToyProject[];
}

export type ProductionEvent = { id: number; created_at: string; from_status: string | null; to_status: string; operation: string | null; job_id: string | null };
export async function listProjectEvents(id: string, before?: string) {
  const params = new URLSearchParams({ project_id: `eq.${id}`, select: "id,created_at,from_status,to_status,operation,job_id", order: "id.desc", limit: "31" });
  if (before && /^\d+$/.test(before)) params.set("id", `lt.${before}`);
  return await supabaseRest(`production_events?${params}`) as ProductionEvent[];
}

export async function listProjectsByStatuses(statuses: ProjectStatus[], limit = 50) {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("status", `in.(${statuses.join(",")})`);
  params.set("automation_blocked", "eq.false");
  params.set("assets_purged_at", "is.null");
  params.set("next_retry_at", `lte.${new Date().toISOString()}`);
  params.set("or", `(lease_until.is.null,lease_until.lt.${new Date().toISOString()})`);
  params.set("order", "next_retry_at.asc,created_at.asc");
  params.set("limit", String(limit));
  return (await supabaseRest(`toy_projects?${params.toString()}`, { method: "GET" })) as ToyProject[];
}

export async function claimProjectForPaidOrder(
  id: string,
  patch: Pick<
    ToyProject,
    | "shopify_order_id"
    | "shopify_order_name"
    | "shopify_webhook_id"
    | "paid_at"
    | "customer_name"
    | "customer_email"
    | "shipping_city"
  >
): Promise<ToyProject | null> {
  const path = `toy_projects?id=eq.${encodeURIComponent(id)}&status=eq.CHECKOUT_CREATED`;
  const rows = (await supabaseRest(path, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...patch,
      status: "PAID_BUILD_STARTING",
      updated_at: new Date().toISOString(),
    }),
  })) as ToyProject[];
  return rows?.[0] || null;
}
