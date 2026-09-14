import { NextRequest, NextResponse } from "next/server";
import { runRetention } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily data-retention job. Same bearer secret as the production sync cron. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const results = await runRetention(1);
    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retention failed";
    console.error("retention cron failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
