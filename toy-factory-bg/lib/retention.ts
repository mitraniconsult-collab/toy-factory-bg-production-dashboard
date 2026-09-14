import { deleteArchivedAsset, deleteProjectUploadRemnants } from "@/lib/storage";
import { withProjectJob } from "@/lib/jobs";
import {
  deleteProjectRow,
  listProjectsForRetention,
  ProjectStatus,
  ToyProject,
  updateProject,
  supabaseRest,
} from "@/lib/projects";

/**
 * Data retention, as promised in /privacy:
 *   - unpaid projects: assets removed after RETENTION_UNPAID_DAYS (default 7)
 *   - shipped/cancelled: assets removed after RETENTION_PAID_DAYS (default 90)
 *
 * Only the generated files are deleted. The order row itself stays, because
 * accounting records must be kept far longer; nothing in the row identifies a
 * face. `assets_purged_at` marks a project as done so it is never re-scanned.
 */

export const RETENTION_UNPAID_DAYS = Number(process.env.RETENTION_UNPAID_DAYS || 7);
export const RETENTION_PAID_DAYS = Number(process.env.RETENTION_PAID_DAYS || 90);

/** No payment happened, so nothing is owed and the upload can go early. */
const UNPAID_STATUSES: ProjectStatus[] = ["CHECKOUT_CREATED", "CHECKOUT_FAILED"];
/** Order is closed; keep files through the complaint window, then delete. */
const CLOSED_STATUSES: ProjectStatus[] = ["SHIPPED", "CANCELLED"];

const ASSET_FIELDS = [
  "preview_storage_path",
  "glb_storage_path",
  "three_mf_storage_path",
] as const;

/** Deletes every archived file of a project and clears the pointers. */
export async function purgeProjectAssets(project: ToyProject) {
  return withProjectJob(project.id, async (project) => {
  // Revoke production access before the first destructive storage operation.
  await updateProject(project.id, { automation_blocked: true, last_operation: "asset-purge" });
  const deleted: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  const patch: Record<string, unknown> = {};

  for (const field of ASSET_FIELDS) {
    const path = project[field];
    if (!path) continue;
    try {
      await deleteArchivedAsset(path);
      deleted.push(field);
      patch[field] = null;
    } catch (error) {
      failed.push({ path: field, error: error instanceof Error ? error.message : "delete failed" });
    }
  }

  // Meshy URLs expire on their own, but drop them so nothing points at a face.
  patch.preview_url = null;
  patch.glb_url = null;
  patch.three_mf_url = null;
  if (!failed.length) {
    try { await deleteProjectUploadRemnants(project.id); patch.assets_purged_at = new Date().toISOString(); }
    catch { failed.push({ path: "upload-remnants", error: "Storage cleanup failed" }); }
  }

  await updateProject(project.id, patch as Partial<ToyProject>);
  return { deleted, failed };
  }, true);
}

export async function runRetention(limit = 1) {
  const now = Date.now();
  await supabaseRest(`prototype_submissions?created_at=lt.${new Date(now - 7 * 86400000).toISOString()}`, { method: "DELETE" });
  const projects = await listProjectsForRetention({
    unpaidStatuses: UNPAID_STATUSES,
    unpaidBefore: new Date(now - RETENTION_UNPAID_DAYS * 86_400_000).toISOString(),
    closedStatuses: CLOSED_STATUSES,
    closedBefore: new Date(now - RETENTION_PAID_DAYS * 86_400_000).toISOString(),
    limit,
  });

  const results: Array<{ id: string; status: ProjectStatus; deleted: string[]; failed: number }> = [];
  for (const project of projects) {
    const outcome = await purgeProjectAssets(project);
    results.push({
      id: project.id,
      status: project.status,
      deleted: outcome.deleted,
      failed: outcome.failed.length,
    });
    if (outcome.failed.length) {
      console.error("retention purge partially failed", { projectId: project.id, failed: outcome.failed });
    }
  }
  return results;
}

/** Full erasure for a GDPR request: files plus the database row. */
export async function eraseProject(project: ToyProject) {
  return withProjectJob(project.id, async (project) => {
  const outcome = await purgeProjectAssets(project);
  if (outcome.failed.length) {
    throw new Error(
      `Не всички файлове бяха изтрити (${outcome.failed.map((f) => f.path).join(", ")}). Проектът НЕ е изтрит — опитай пак.`
    );
  }
  await deleteProjectRow(project.id);
  return outcome.deleted;
  }, true);
}
