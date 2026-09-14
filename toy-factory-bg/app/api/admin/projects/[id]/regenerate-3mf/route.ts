import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getProject } from "@/lib/projects";
import { regenerateProject } from "@/lib/production";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    if ((await request.json()).confirmCredits !== true) return NextResponse.json({ error: "Confirm Meshy credit spend" }, { status: 400 });
    const project = await getProject((await params).id);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ ok: true, project: await regenerateProject(project) }, { status: 202 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Regeneration failed" }, { status: e instanceof Error && e.message === "UNAUTHORIZED" ? 401 : 409 }); }
}
