import { it, expect, vi } from "vitest";
vi.mock("@/lib/projects", () => ({ supabaseRest: vi.fn(), updateProject: vi.fn(), getProject: vi.fn() }));
import { supabaseRest } from "@/lib/projects";
import { externalOperation, withProjectJob, retryDelay, ReconciliationRequired, JobBusyError } from "@/lib/jobs";
import { project } from "./fixtures";
it("does no work when another worker owns the lease", async () => {
  vi.mocked(supabaseRest).mockResolvedValue([]);
  const execute = vi.fn();
  await expect(withProjectJob(project().id, execute)).rejects.toBeInstanceOf(JobBusyError);
  expect(execute).not.toHaveBeenCalled();
});
it("replays a recorded external result without spending again", async () => {
  vi.mocked(supabaseRest).mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: "succeeded", result: "task-1" }]);
  const execute = vi.fn();
  expect(await externalOperation(project(), "build", "1", execute)).toBe("task-1");
  expect(execute).not.toHaveBeenCalled();
});
it("quarantines an ambiguous provider submission instead of retrying", async () => {
  vi.mocked(supabaseRest).mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: "executing" }]);
  const execute = vi.fn();
  await expect(externalOperation(project(), "build", "1", execute)).rejects.toBeInstanceOf(ReconciliationRequired);
  expect(execute).not.toHaveBeenCalled();
});
it("bounds exponential backoff", () => { expect([1, 2, 3, 99].map(retryDelay)).toEqual([30, 60, 120, 3600]); });
