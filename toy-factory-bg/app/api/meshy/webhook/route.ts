import crypto from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { findProjectByTaskId } from "@/lib/projects";
import { syncProject } from "@/lib/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type MeshyWebhookPayload = {
  id?: string;
  status?: string;
  type?: string;
};

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"]);

function webhookSecret() {
  return process.env.MESHY_WEBHOOK_SECRET || process.env.CRON_SECRET || "";
}

function safeEqual(provided: string, expected: string) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "meshy-webhook",
    protected: Boolean(webhookSecret()),
  });
}

export async function POST(request: NextRequest) {
  const expected = webhookSecret();
  const provided = request.nextUrl.searchParams.get("secret") || "";

  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: MeshyWebhookPayload;
  try {
    payload = (await request.json()) as MeshyWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const taskId = typeof payload.id === "string" ? payload.id.trim() : "";
  const status = typeof payload.status === "string" ? payload.status.toUpperCase() : "";

  // Meshy sends progress updates too. Only terminal events can advance/fail our production pipeline.
  if (!taskId || !TERMINAL_STATUSES.has(status)) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 202 });
  }

  // Acknowledge Meshy immediately. Next.js/Vercel keeps the invocation alive for this work.
  after(async () => {
    try {
      const project = await findProjectByTaskId(taskId);
      if (!project) {
        console.info("Meshy webhook task is not linked to a toy project", {
          taskId,
          status,
          type: payload.type || null,
        });
        return;
      }

      const updated = await syncProject(project);
      console.info("Meshy webhook production sync", {
        projectId: project.id,
        taskId,
        taskStatus: status,
        fromStatus: project.status,
        toStatus: updated?.status || project.status,
      });
    } catch (error) {
      console.error("Meshy webhook production sync failed", {
        taskId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}
