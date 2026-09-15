import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { readJson } from "@/lib/http";
import { withProjectJob } from "@/lib/jobs";
import { updateProject } from "@/lib/projects";
export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await readJson(request);
    if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 20 || !body.ids.every((id) => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id)) || !["PRINTED", "PACKED"].includes(String(body.status))) return NextResponse.json({ error: "Invalid bulk action" }, { status: 400 });
    const target = body.status as "PRINTED" | "PACKED";
    const results = [];
    for (const id of [...new Set<string>(body.ids)]) {
      try {
        await withProjectJob(id, async (p) => {
          if (p.automation_blocked || p.assets_purged_at) throw new Error("Requires review");
          if (p.status === target) return;
          if (p.status !== (target === "PRINTED" ? "PRINTING" : "PRINTED")) throw new Error("Status changed; refresh the queue");
          await updateProject(id, { status: target, last_operation: `bulk-${target.toLowerCase()}` });
        }, true);
        results.push({ id, ok: true });
      } catch { results.push({ id, ok: false }); }
    }
    return NextResponse.json({ results });
  } catch (error) { return NextResponse.json({ error: "Bulk update unavailable" }, { status: error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 503 }); }
}
