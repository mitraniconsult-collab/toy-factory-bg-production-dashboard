import { jobContext } from "@/lib/job-context";
const RESIZE_BASE_URL = "https://api.meshy.ai/openapi/v1/resize";
const PRINT_BASE_URL = "https://api.meshy.ai/openapi/v1/print/multi-color";

export type ModelKind = "pop" | "mini" | "brick";
export type MeshyStage = "prototype" | "build";

export type MeshyTask = {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED" | "CANCELED" | string;
  progress?: number;
  task_error?: { message?: string } | null;
  image_urls?: string[];
  thumbnail_url?: string;
  model_urls?: { glb?: string; obj?: string; mtl?: string; "3mf"?: string };
};

function creativeLabBase(kind: ModelKind) {
  if (kind === "mini") return "https://api.meshy.ai/openapi/creative-lab/figure/v1";
  if (kind === "brick") return "https://api.meshy.ai/openapi/creative-lab/brick-figure/v1";
  return "https://api.meshy.ai/openapi/creative-lab/vinyl-figure/v1";
}

function getApiKey() {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error("MESHY_API_KEY is missing on the server.");
  return key;
}

function getWebhookUrl() {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  ).replace(/\/$/, "");
  const secret = process.env.MESHY_WEBHOOK_SECRET || process.env.CRON_SECRET;
  if (!base || !secret) return null;
  return `${base}/api/meshy/webhook?secret=${encodeURIComponent(secret)}`;
}

function withWebhook<T extends Record<string, unknown>>(body: T) {
  const webhookUrl = getWebhookUrl();
  return webhookUrl ? { ...body, webhook_url: webhookUrl } : body;
}

async function meshyFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(jobContext.getStore() ? [jobContext.getStore()!.signal] : [])]),
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message || body?.detail || body?.error || `Meshy request failed with ${response.status}`;
    throw new Error(String(message));
  }
  return body;
}

export async function createPrototype(kind: ModelKind, imageUrlOrDataUri: string): Promise<string> {
  const data = await meshyFetch(`${creativeLabBase(kind)}/prototype`, {
    method: "POST",
    body: JSON.stringify(withWebhook({ image_url: imageUrlOrDataUri, remove_background: true })),
  });
  if (!data?.result) throw new Error("Meshy did not return a prototype task id.");
  return data.result;
}

export async function createBuild(kind: ModelKind, prototypeTaskId: string): Promise<string> {
  const data = await meshyFetch(`${creativeLabBase(kind)}/build`, {
    method: "POST",
    body: JSON.stringify(withWebhook({ input_task_id: prototypeTaskId })),
  });
  if (!data?.result) throw new Error("Meshy did not return a build task id.");
  return data.result;
}

export async function getTask(kind: ModelKind, stage: MeshyStage, id: string): Promise<MeshyTask> {
  if (stage !== "prototype" && stage !== "build") throw new Error("Invalid Meshy stage.");
  return meshyFetch(`${creativeLabBase(kind)}/${stage}/${encodeURIComponent(id)}`);
}

export async function createResize(modelUrl: string, heightCm: number): Promise<string> {
  if (!Number.isFinite(heightCm) || heightCm <= 0) throw new Error("Invalid production height.");
  const data = await meshyFetch(RESIZE_BASE_URL, {
    method: "POST",
    body: JSON.stringify(withWebhook({
      model_url: modelUrl,
      resize_height: heightCm / 100,
      origin_at: "bottom",
    })),
  });
  if (!data?.result) throw new Error("Meshy did not return a resize task id.");
  return data.result;
}

export async function getResize(id: string): Promise<MeshyTask> {
  return meshyFetch(`${RESIZE_BASE_URL}/${encodeURIComponent(id)}`);
}

export async function createMultiColorPrint(modelUrl: string): Promise<string> {
  const parsed = Number(process.env.MESHY_PRINT_MAX_COLORS || "8");
  const maxColors = Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 1), 16) : 8;
  const data = await meshyFetch(PRINT_BASE_URL, {
    method: "POST",
    body: JSON.stringify(withWebhook({ model_url: modelUrl, max_colors: maxColors, style: "cartoon" })),
  });
  if (!data?.result) throw new Error("Meshy did not return a multi-color print task id.");
  return data.result;
}

export async function getMultiColorPrint(id: string): Promise<MeshyTask> {
  return meshyFetch(`${PRINT_BASE_URL}/${encodeURIComponent(id)}`);
}
