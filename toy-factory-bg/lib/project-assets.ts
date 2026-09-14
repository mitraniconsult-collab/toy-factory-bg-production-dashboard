import { getMultiColorPrint, getResize, getTask } from "@/lib/meshy";
import { ToyProject, updateProject } from "@/lib/projects";
import { archiveBytes, archiveRemoteAsset } from "@/lib/storage";
import { bambuTargetFromEnv, resizeThreeMfToHeight } from "@/lib/three-mf";

export type RecoverableAssetKind = "preview" | "glb" | "3mf";

function succeeded(status?: string) {
  return status === "SUCCEEDED";
}

async function freshPreviewUrl(project: ToyProject) {
  if (project.prototype_task_id) {
    try {
      const task = await getTask(project.model_kind || "pop", "prototype", project.prototype_task_id);
      if (succeeded(task.status)) return task.image_urls?.[0] || task.thumbnail_url || project.preview_url;
    } catch (error) {
      console.warn("Could not refresh legacy preview from Meshy", { projectId: project.id, error });
    }
  }
  return project.preview_url || null;
}

async function freshGlbUrl(project: ToyProject) {
  if (project.resize_task_id) {
    try {
      const task = await getResize(project.resize_task_id);
      if (succeeded(task.status) && task.model_urls?.glb) return task.model_urls.glb;
    } catch (error) {
      console.warn("Could not refresh legacy resized GLB from Meshy", { projectId: project.id, error });
    }
  }

  if (project.build_task_id) {
    try {
      const task = await getTask(project.model_kind || "pop", "build", project.build_task_id);
      if (succeeded(task.status) && task.model_urls?.glb) return task.model_urls.glb;
    } catch (error) {
      console.warn("Could not refresh legacy build GLB from Meshy", { projectId: project.id, error });
    }
  }

  return project.glb_url || null;
}

async function freshThreeMfUrl(project: ToyProject) {
  if (project.print_task_id) {
    try {
      const task = await getMultiColorPrint(project.print_task_id);
      if (succeeded(task.status) && task.model_urls?.["3mf"]) return task.model_urls["3mf"];
    } catch (error) {
      console.warn("Could not refresh legacy 3MF from Meshy", { projectId: project.id, error });
    }
  }

  return project.three_mf_url || null;
}

export async function ensureProjectAssetArchived(project: ToyProject, kind: RecoverableAssetKind) {
  if (project.assets_purged_at) throw new Error("Project assets have been permanently purged.");
  if (kind === "preview") {
    if (project.preview_storage_path) return project.preview_storage_path;
    const sourceUrl = await freshPreviewUrl(project);
    if (!sourceUrl) throw new Error("Preview source is no longer available.");

    const path = await archiveRemoteAsset({
      projectId: project.id,
      sourceUrl,
      filename: "preview-image",
    });
    await updateProject(project.id, { preview_storage_path: path, preview_url: sourceUrl });
    return path;
  }

  if (kind === "glb") {
    if (project.glb_storage_path) return project.glb_storage_path;
    const sourceUrl = await freshGlbUrl(project);
    if (!sourceUrl) throw new Error("GLB source is no longer available from this legacy project.");

    const path = await archiveRemoteAsset({
      projectId: project.id,
      sourceUrl,
      filename: "model.glb",
      contentType: "model/gltf-binary",
    });
    await updateProject(project.id, { glb_storage_path: path, glb_url: sourceUrl });
    return path;
  }

  if (project.three_mf_storage_path) return project.three_mf_storage_path;
  const sourceUrl = await freshThreeMfUrl(project);
  if (!sourceUrl) throw new Error("3MF source is no longer available from this legacy project.");

  const remote = await fetch(sourceUrl, { cache: "no-store" });
  if (!remote.ok) throw new Error(`Could not recover legacy 3MF from Meshy (${remote.status}).`);
  const sourceBytes = new Uint8Array(await remote.arrayBuffer());
  const resized = resizeThreeMfToHeight(sourceBytes, project.size_cm * 10, {
    bambuTarget: bambuTargetFromEnv(),
  });
  const path = await archiveBytes({
    projectId: project.id,
    bytes: resized.bytes,
    filename: "model.3mf",
    contentType: "model/3mf",
  });
  await updateProject(project.id, {
    three_mf_storage_path: path,
    three_mf_url: sourceUrl,
    ...(resized.palette.length ? { print_palette: resized.palette } : {}),
  });
  return path;
}
