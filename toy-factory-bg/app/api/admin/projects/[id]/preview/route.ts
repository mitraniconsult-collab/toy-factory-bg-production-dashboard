import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getProject } from "@/lib/projects";
import { ensureProjectAssetArchived } from "@/lib/project-assets";
import { fetchPrivateAsset } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.assets_purged_at) return NextResponse.json({ error: "Project assets were purged" }, { status: 410 });

  try {
    const path = project.preview_storage_path || await ensureProjectAssetArchived(project, "preview");
    const storageResponse = await fetchPrivateAsset(path);
    const bytes = await storageResponse.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": storageResponse.headers.get("content-type") || "image/jpeg",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Legacy preview recovery failed", { projectId: id, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not recover preview" },
      { status: 404 }
    );
  }
}
