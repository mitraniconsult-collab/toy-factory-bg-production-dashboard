import { it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/meshy", () => ({ createBuild: vi.fn(), createResize: vi.fn(), createMultiColorPrint: vi.fn(), getTask: vi.fn(), getResize: vi.fn(), getMultiColorPrint: vi.fn() }));
vi.mock("@/lib/projects", () => ({ supabaseRest: vi.fn(), claimProjectTransition: vi.fn(), getProject: vi.fn(), listProjectsByStatuses: vi.fn(), updateProject: vi.fn() }));
vi.mock("@/lib/jobs", () => ({ withProjectJob: vi.fn(), externalOperation: vi.fn(), JobBusyError: class extends Error {} }));
vi.mock("@/lib/storage", () => ({ archiveBytes: vi.fn(), archiveRemoteAsset: vi.fn() }));
import * as meshy from "@/lib/meshy";
import * as projects from "@/lib/projects";
import { syncProject } from "@/lib/production";
import { project } from "./fixtures";
import { withProjectJob } from "@/lib/jobs";

beforeEach(() => {
  vi.mocked(projects.updateProject).mockImplementation(async (id, patch) => project({ id, ...patch }));
  vi.mocked(withProjectJob).mockImplementation(async (id, work) => work((await projects.getProject(id))!));
});
it.each(["FAILED", "EXPIRED", "CANCELED"])("records Meshy terminal %s", async (status) => {
  vi.mocked(meshy.getTask).mockResolvedValue({ id: "build", status });
  vi.mocked(projects.getProject).mockResolvedValue(project({ status: "3D_GENERATING", build_task_id: "build", paid_at: "2026-09-01" }));
  const result = await syncProject(project({ status: "3D_GENERATING", build_task_id: "build" }));
  expect(result?.status).toBe("BUILD_FAILED");
});
it("only the atomic claim winner can submit a paid build", async () => {
  vi.mocked(projects.claimProjectTransition).mockResolvedValue(null);
  vi.mocked(projects.getProject).mockResolvedValue(project({ status: "PAID_BUILD_STARTING", paid_at: "2026-09-01" }));
  await syncProject(project({ status: "PAID_BUILD_STARTING" }));
  expect(meshy.createBuild).not.toHaveBeenCalled();
});
it("advances successful build to resize", async () => {
  const p = project({ status: "3D_GENERATING", build_task_id: "build", paid_at: "2026-09-01" });
  vi.mocked(projects.getProject).mockResolvedValue(p);
  vi.mocked(meshy.getTask).mockResolvedValue({ id: "build", status: "SUCCEEDED", model_urls: { glb: "https://asset.invalid/model.glb" } });
  vi.mocked(projects.claimProjectTransition).mockResolvedValue(project({ ...p, status: "MODEL_RESIZE_SUBMITTING" }));
  vi.mocked(meshy.createResize).mockResolvedValue("resize");
  vi.mocked(meshy.getResize).mockResolvedValue({ id: "resize", status: "PENDING" });
  const result = await syncProject(p);
  expect(result?.status).toBe("MODEL_RESIZE_SUBMITTING");
  expect(meshy.createResize).not.toHaveBeenCalled();
});
