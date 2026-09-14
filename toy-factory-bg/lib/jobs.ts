import { randomUUID } from "node:crypto";
import { jobContext } from "@/lib/job-context";
import { getProject, supabaseRest, updateProject, type ToyProject } from "@/lib/projects";

export class JobBusyError extends Error { constructor() { super("Project is busy or awaiting retry"); } }
export class ReconciliationRequired extends Error { constructor(key: string) { super(`Reconcile external operation before retry: ${key}`); } }
export function retryDelay(attempt: number) { return Math.min(3600, 30 * 2 ** Math.min(Math.max(attempt - 1, 0), 7)); }

export async function withProjectJob<T>(id: string, work: (project: ToyProject) => Promise<T>, manual = false): Promise<T> {
  if (jobContext.getStore()?.projectId === id) {
    const p = await getProject(id);
    if (!p) throw new Error("Project not found");
    return work(p);
  }
  const token = randomUUID();
  const rows = await supabaseRest("rpc/claim_production_job", { method: "POST", body: JSON.stringify({ p_id: id, p_token: token, p_manual: manual }) }) as ToyProject[];
  if (!rows[0]) throw new JobBusyError();
  const p = rows[0];
  return jobContext.run({ projectId: id, token, signal: AbortSignal.timeout(100_000) }, async () => {
    try {
      const result = await work(p);
      if (await getProject(id)) await updateProject(id, { next_retry_at: new Date(Date.now() + 30_000).toISOString() });
      return result;
    } catch (error) {
      await updateProject(id, {
        next_retry_at: new Date(Date.now() + retryDelay(p.job_attempts || 1) * 1000).toISOString(),
        last_error: error instanceof Error ? error.message : "Production job failed",
        ...(error instanceof ReconciliationRequired ? { automation_blocked: true } : {}),
      }).catch(() => undefined);
      throw error;
    } finally {
      // Token fence prevents an old worker releasing a successor's lease.
      await supabaseRest(`toy_projects?id=eq.${id}&lease_token=eq.${token}`, { method: "PATCH", body: JSON.stringify({ lease_token: null, lease_until: null }) }).catch(() => undefined);
    }
  });
}

/** Durable replay for APIs without a documented idempotency key. Ambiguous
 * outcomes are quarantined; never claim exactly-once delivery to a provider. */
export async function externalOperation<T>(project: ToyProject, operation: string, inputKey: string, execute: () => Promise<T>): Promise<T> {
  const key = `${project.id}:${operation}:${inputKey}`;
  const params = `operation_key=eq.${encodeURIComponent(key)}`;
  const inserted = await supabaseRest("production_operations?on_conflict=operation_key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ operation_key: key, project_id: project.id, status: "executing" }) }) as unknown[];
  if (!inserted.length) {
    const rows = await supabaseRest(`production_operations?${params}&select=*`) as Array<{ status: string; result: T }>;
    if (rows[0]?.status === "succeeded") return rows[0].result;
    throw new ReconciliationRequired(key);
  }
  await updateProject(project.id, { last_operation: operation });
  console.info(JSON.stringify({ event: "external_operation", projectId: project.id, jobId: jobContext.getStore()?.token, orderId: project.shopify_order_id, operation, taskId: inputKey }));
  try {
    const result = await execute();
    await supabaseRest(`production_operations?${params}`, { method: "PATCH", body: JSON.stringify({ status: "succeeded", result, updated_at: new Date().toISOString() }) });
    return result;
  } catch {
    await supabaseRest(`production_operations?${params}`, { method: "PATCH", body: JSON.stringify({ status: "unknown", updated_at: new Date().toISOString() }) }).catch(() => undefined);
    throw new ReconciliationRequired(key);
  }
}
