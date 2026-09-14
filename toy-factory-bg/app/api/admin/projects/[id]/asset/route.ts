import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getProject } from "@/lib/projects";
import { fetchPrivateAsset } from "@/lib/storage";
import { ensureProjectAssetArchived } from "@/lib/project-assets";

export const dynamic = "force-dynamic";

type AssetKind = "glb" | "3mf";

const ASSETS: Record<AssetKind, { field: "glb_storage_path" | "three_mf_storage_path"; filename: string; contentType: string }> = {
  glb: { field: "glb_storage_path", filename: "model.glb", contentType: "model/gltf-binary" },
  "3mf": { field: "three_mf_storage_path", filename: "model.3mf", contentType: "model/3mf" },
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const kind = request.nextUrl.searchParams.get("kind") as AssetKind | null;
  if (!kind || !(kind in ASSETS)) {
    return NextResponse.json({ error: "Invalid asset kind" }, { status: 400 });
  }

  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.assets_purged_at) return NextResponse.json({ error: "Project assets were purged" }, { status: 410 });

  const config = ASSETS[kind];
  let path = project[config.field];

  if (!path && kind === "3mf") {
    return NextResponse.json(
      {
        error: "This legacy 3MF was never archived and the old Meshy file has expired. Use Regenerate 3MF in Production control.",
        code: "LEGACY_3MF_REGEN_REQUIRED",
      },
      { status: 409 }
    );
  }

  if (!path) {
    try {
      path = await ensureProjectAssetArchived(project, kind);
    } catch (error) {
      console.error("Legacy asset recovery failed", { projectId: id, kind, error });
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not recover legacy asset" },
        { status: 404 }
      );
    }
  }

  try {
    const storageResponse = await fetchPrivateAsset(path);
    const filename = `POPME-${project.shopify_order_name?.replace(/[^a-zA-Z0-9_-]/g, "") || project.id.slice(0, 8)}-${project.size_cm}cm.${kind}`;
    const contentLength = storageResponse.headers.get("content-length");

    return new NextResponse(storageResponse.body, {
      status: 200,
      headers: {
        "Content-Type": storageResponse.headers.get("content-type") || config.contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Admin asset download failed", { projectId: id, kind, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not download asset" },
      { status: 502 }
    );
  }
}
