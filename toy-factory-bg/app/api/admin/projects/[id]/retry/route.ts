import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getProject } from "@/lib/projects";
import { retryProject } from "@/lib/production";
export const runtime = "nodejs";
// 3MF post-processing of a ~100 MB Meshy file takes ~10-20 s.
export const maxDuration = 120;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(); const { id } = await params; const project = await getProject(id);
    if ((await request.json()).confirmCredits !== true) return NextResponse.json({ error: "Confirm Meshy credit spend" }, { status: 400 });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ ok: true, project: await retryProject(project) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Retry failed" }, { status: e instanceof Error && e.message === "UNAUTHORIZED" ? 401 : 500 }); }
}
