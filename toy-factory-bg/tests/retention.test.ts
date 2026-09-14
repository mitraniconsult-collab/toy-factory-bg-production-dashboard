import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/jobs", () => ({ withProjectJob: vi.fn() }));
vi.mock("@/lib/storage", () => ({ deleteArchivedAsset: vi.fn(), deleteProjectUploadRemnants: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/projects", () => ({ updateProject: vi.fn(), deleteProjectRow: vi.fn(), listProjectsForRetention: vi.fn() }));
import { deleteArchivedAsset } from "@/lib/storage";
import { updateProject, deleteProjectRow } from "@/lib/projects";
import { purgeProjectAssets, eraseProject } from "@/lib/retention";
import { project } from "./fixtures";
import { withProjectJob } from "@/lib/jobs";

describe("retention", () => {
  it("clears asset pointers and marks a successful purge", async () => {
    vi.mocked(deleteArchivedAsset).mockResolvedValue(1);
    const p = project({ preview_storage_path: "p/preview", glb_storage_path: "p/glb" });
    vi.mocked(withProjectJob).mockImplementation(async (_id, work) => work(p));
    await purgeProjectAssets(p);
    expect(deleteArchivedAsset).toHaveBeenCalledTimes(2);
    expect(updateProject).toHaveBeenCalledWith(p.id, expect.objectContaining({ preview_url: null, glb_storage_path: null, assets_purged_at: expect.any(String) }));
  });
  it("keeps the row and failed asset pointer when storage deletion fails", async () => {
    vi.mocked(deleteArchivedAsset).mockRejectedValue(new Error("temporary outage"));
    vi.mocked(withProjectJob).mockImplementation(async (_id, work) => work(project({ glb_storage_path: "p/glb" })));
    await expect(eraseProject(project({ glb_storage_path: "p/glb" }))).rejects.toThrow();
    expect(deleteProjectRow).not.toHaveBeenCalled();
    expect(vi.mocked(updateProject).mock.calls.at(-1)?.[1]).not.toHaveProperty("assets_purged_at");
  });
  it("erases the row only after all assets were deleted", async () => {
    vi.mocked(deleteArchivedAsset).mockResolvedValue(1);
    const p = project({ glb_storage_path: "p/glb" });
    vi.mocked(withProjectJob).mockImplementation(async (_id, work) => work(p));
    await eraseProject(p);
    expect(deleteProjectRow).toHaveBeenCalledWith(p.id);
  });
});
