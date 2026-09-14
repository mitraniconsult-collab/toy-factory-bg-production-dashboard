import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createTemporaryAssetUrl } from "@/lib/asset-access";
import { createMultiColorPrint } from "@/lib/meshy";
import { ensureProjectAssetArchived } from "@/lib/project-assets";
import { getProject, updateProject } from "@/lib/projects";

export const runtime = "nodejs";
// 3MF post-processing of a ~100 MB Meshy file takes ~10-20 s.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.assets_purged_at) return NextResponse.json({ error: "Project assets were purged" }, { status: 410 });

  if (project.three_mf_storage_path) {
    return NextResponse.json({ ok: true, alreadyArchived: true });
  }

  try {
    // Recover/archive the resized GLB first. For normal Storage objects and for
    // oversized chunked archives we expose the same short-lived POPME proxy URL
    // to Meshy, so regeneration does not depend on Supabase's per-object limit.
    const glbPath = await ensureProjectAssetArchived(project, "glb");
    const inputUrl = createTemporaryAssetUrl(new URL(request.url).origin, glbPath, 60 * 60);
    const printTaskId = await createMultiColorPrint(inputUrl);

    await updateProject(project.id, {
      print_task_id: printTaskId,
      three_mf_url: null,
      three_mf_storage_path: null,
      status: "PRINT_FILE_GENERATING",
      last_error: null,
    });

    return NextResponse.json({ ok: true, printTaskId, status: "PRINT_FILE_GENERATING" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not regenerate 3MF";
    await updateProject(project.id, { last_error: message }).catch(() => null);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
