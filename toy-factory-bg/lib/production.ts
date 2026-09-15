import { createBuild, createMultiColorPrint, createResize, getMultiColorPrint, getResize, getTask } from "@/lib/meshy";
import { claimProjectTransition, getProject, listProjectsByStatuses, updateProject, supabaseRest, type ProjectStatus, type ToyProject } from "@/lib/projects";
import { archiveBytes, archiveRemoteAsset, downloadBounded } from "@/lib/storage";
import { bambuTargetFromEnv, resizeThreeMfToHeight, ThreeMfUnsupportedError } from "@/lib/three-mf";
import { externalOperation, withProjectJob, JobBusyError } from "@/lib/jobs";
import { createTemporaryAssetUrl } from "@/lib/asset-access";

const ACTIVE: ProjectStatus[] = ["PAID_BUILD_STARTING", "BUILD_SUBMITTING", "3D_GENERATING", "MODEL_RESIZE_SUBMITTING", "MODEL_RESIZING", "PRINT_FILE_SUBMITTING", "PRINT_FILE_GENERATING"];
function failed(status: string) { return ["FAILED", "EXPIRED", "CANCELED"].includes(status); }
function assertUsable(p: ToyProject) {
  if (p.assets_purged_at || p.automation_blocked || !p.paid_at) throw new Error("Project requires operator review before production");
}
function privateGlb(p: ToyProject) {
  const origin = process.env.SITE_URL;
  return p.glb_storage_path && origin ? createTemporaryAssetUrl(origin, p.glb_storage_path) : p.glb_url;
}

/** One leased stage per invocation. Unknown provider outcomes are quarantined. */
async function advance(p: ToyProject): Promise<ToyProject | null> {
  assertUsable(p);
  if (p.shopify_order_id) {
    const holds = await supabaseRest(`shopify_order_holds?order_id=eq.${encodeURIComponent(p.shopify_order_id)}&select=order_id`);
    if (holds?.length) return updateProject(p.id, { automation_blocked: true, last_error: "Shopify cancellation/refund requires review" });
  }
  if (p.status === "PAID_BUILD_STARTING") {
    const claimed = await claimProjectTransition(p.id, p.status, "BUILD_SUBMITTING");
    if (!claimed) return getProject(p.id);
    p = claimed;
  }
  if (p.status === "BUILD_SUBMITTING") {
    const taskId = await externalOperation(p, "meshy-build", `${p.prototype_task_id}:${p.retry_count || 0}`, () => createBuild(p.model_kind, p.prototype_task_id));
    return updateProject(p.id, { status: "3D_GENERATING", build_task_id: taskId, last_error: null });
  }
  if (p.status === "3D_GENERATING" && p.build_task_id) {
    const task = await getTask(p.model_kind, "build", p.build_task_id);
    if (failed(task.status)) return updateProject(p.id, { status: "BUILD_FAILED", last_error: task.task_error?.message || `Build ${task.status}` });
    if (task.status !== "SUCCEEDED") return p;
    if (!task.model_urls?.glb) throw new Error("Successful build has no GLB");
    return updateProject(p.id, { status: "MODEL_RESIZE_SUBMITTING", glb_url: task.model_urls.glb, last_error: null });
  }
  if (p.status === "MODEL_RESIZE_SUBMITTING") {
    let input = privateGlb(p);
    if (!p.glb_storage_path && p.build_task_id) input = (await getTask(p.model_kind, "build", p.build_task_id)).model_urls?.glb || input;
    if (!input) throw new Error("Missing GLB for resizing");
    const taskId = await externalOperation(p, "meshy-resize", `${p.build_task_id}:${p.retry_count || 0}`, () => createResize(input!, p.size_cm));
    return updateProject(p.id, { status: "MODEL_RESIZING", resize_task_id: taskId, last_error: null });
  }
  if (p.status === "MODEL_RESIZING" && p.resize_task_id) {
    const task = await getResize(p.resize_task_id);
    if (failed(task.status)) return updateProject(p.id, { status: "PRINT_FILE_FAILED", last_error: task.task_error?.message || `Resize ${task.status}` });
    if (task.status !== "SUCCEEDED") return p;
    if (!task.model_urls?.glb) throw new Error("Successful resize has no GLB");
    const path = await archiveRemoteAsset({ projectId: p.id, sourceUrl: task.model_urls.glb, filename: "model.glb", contentType: "model/gltf-binary" });
    return updateProject(p.id, { status: "PRINT_FILE_SUBMITTING", glb_url: task.model_urls.glb, glb_storage_path: path, last_error: null });
  }
  if (p.status === "PRINT_FILE_SUBMITTING") {
    const input = privateGlb(p);
    if (!input) throw new Error("Missing printable GLB");
    const taskId = await externalOperation(p, "meshy-print", `${p.resize_task_id}:${p.retry_count || 0}`, () => createMultiColorPrint(input));
    return updateProject(p.id, { status: "PRINT_FILE_GENERATING", print_task_id: taskId, last_error: null });
  }
  if (p.status === "PRINT_FILE_GENERATING" && p.print_task_id) {
    const task = await getMultiColorPrint(p.print_task_id);
    if (failed(task.status)) return updateProject(p.id, { status: "PRINT_FILE_FAILED", last_error: task.task_error?.message || `3MF ${task.status}` });
    if (task.status !== "SUCCEEDED") return p;
    const url = task.model_urls?.["3mf"];
    if (!url) throw new Error("Successful print task has no 3MF");
    await updateProject(p.id, { three_mf_url: url, last_operation: "archive-3mf" });
    const bytes = await downloadBounded(url);
    const result = resizeThreeMfToHeight(bytes, p.size_cm * 10, { bambuTarget: bambuTargetFromEnv() });
    const path = await archiveBytes({ projectId: p.id, bytes: result.bytes, filename: "model.3mf", contentType: "model/3mf" });
    return updateProject(p.id, { status: "READY_FOR_PRINT", three_mf_storage_path: path, print_palette: result.palette, last_error: null });
  }
  return p;
}

export async function syncProject(input: string | ToyProject) {
  return withProjectJob(typeof input === "string" ? input : input.id, async (p) => {
    try { return await advance(p); }
    catch (error) {
      if (error instanceof ThreeMfUnsupportedError) return updateProject(p.id, { status: "PRINT_FILE_FAILED", automation_blocked: true, last_error: error.message });
      throw error;
    }
  });
}

export async function syncActiveProjects(_legacyLimit?: number) {
  // One heavy project per invocation. Fair ordering prevents pending providers
  // from starving newer jobs. Terminal webhooks also wake one project.
  const projects = await listProjectsByStatuses(ACTIVE, 1);
  const results = [];
  for (const p of projects) {
    try { const updated = await syncProject(p.id); results.push({ id: p.id, ok: true, status: updated?.status }); }
    catch (error) { results.push({ id: p.id, ok: error instanceof JobBusyError, error: error instanceof Error ? error.message : "Sync failed" }); }
  }
  return results;
}

export async function retryProject(project: ToyProject) {
  return withProjectJob(project.id, async (p) => {
    assertUsable(p);
    if (!["BUILD_FAILED", "PRINT_FILE_FAILED"].includes(p.status)) throw new Error("Project is not retryable");
    return updateProject(p.id, { status: p.status === "BUILD_FAILED" ? "BUILD_SUBMITTING" : "MODEL_RESIZE_SUBMITTING", retry_count: (p.retry_count || 0) + 1, last_error: null, next_retry_at: new Date().toISOString() });
  }, true);
}

export async function regenerateProject(project: ToyProject) {
  return withProjectJob(project.id, async (p) => {
    assertUsable(p);
    if (p.three_mf_storage_path) return p;
    if (!["PRINT_FILE_FAILED", "READY_FOR_PRINT"].includes(p.status) || !p.glb_storage_path) throw new Error("Only archived legacy/failed print files can be regenerated");
    return updateProject(p.id, { status: "PRINT_FILE_SUBMITTING", retry_count: (p.retry_count || 0) + 1, last_error: null, next_retry_at: new Date().toISOString() });
  }, true);
}
