import { AsyncLocalStorage } from "node:async_hooks";
export const jobContext = new AsyncLocalStorage<{ projectId: string; token: string; signal: AbortSignal }>();
export function projectFence(id: string) {
  const job = jobContext.getStore();
  if (!job || job.projectId !== id) return "";
  if (job.signal.aborted) throw new Error("Production job deadline exceeded");
  return `&lease_token=eq.${job.token}&lease_until=gt.${encodeURIComponent(new Date().toISOString())}`;
}
