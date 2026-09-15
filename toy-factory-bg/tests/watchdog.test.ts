import { it, expect, vi } from "vitest";
vi.mock("@/lib/alerts", () => ({ sendAlert: vi.fn() }));
vi.mock("@/lib/projects", () => ({ listProjectsNeedingAlert: vi.fn(), updateProject: vi.fn().mockResolvedValue(null) }));
import { sendAlert } from "@/lib/alerts";
import { listProjectsNeedingAlert, updateProject } from "@/lib/projects";
import { runWatchdog } from "@/lib/watchdog";
import { project } from "./fixtures";
it("does not mark a failed alert as sent", async () => {
  vi.mocked(listProjectsNeedingAlert).mockResolvedValue([project({ last_error: "failed", alert_attempts: 1 })]);
  vi.mocked(sendAlert).mockResolvedValue(false);
  await runWatchdog();
  expect(updateProject).toHaveBeenCalledWith(project().id, expect.objectContaining({ alert_attempts: 2 }));
  expect(vi.mocked(updateProject).mock.calls[0][1]).not.toHaveProperty("alert_sent_at");
});
it("marks success only after provider acceptance", async () => {
  vi.mocked(listProjectsNeedingAlert).mockResolvedValue([project({ last_error: "failed" })]);
  vi.mocked(sendAlert).mockResolvedValue(true);
  await runWatchdog();
  expect(updateProject).toHaveBeenCalledWith(project().id, expect.objectContaining({ alert_sent_at: expect.any(String) }));
});
