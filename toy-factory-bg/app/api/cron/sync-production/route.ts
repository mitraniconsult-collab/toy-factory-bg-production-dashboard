import { NextResponse } from "next/server";
import { syncActiveProjects } from "@/lib/production";
import { runWatchdog } from "@/lib/watchdog";

export const runtime = "nodejs";
// 3MF post-processing of a ~100 MB Meshy file takes ~10-20 s.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const results = await syncActiveProjects(50);
    const alerts = await runWatchdog().catch((error) => {
      console.error("watchdog failed", error);
      return [];
    });
    return NextResponse.json({ ok: true, count: results.length, results, alerts });
  } catch (error) {
    console.error("cron sync failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cron sync failed" }, { status: 500 });
  }
}
