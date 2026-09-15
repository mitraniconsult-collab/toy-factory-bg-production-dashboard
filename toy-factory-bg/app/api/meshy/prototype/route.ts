import { NextResponse } from "next/server";
import { type ModelKind } from "@/lib/meshy";
import { submitPrototype } from "@/lib/prototype-submissions";
import { consumeRateLimit, requestClientKey } from "@/lib/rate-limit";
import { readJson, publicFailure } from "@/lib/http";
import { issuePreviewAccess } from "@/lib/preview-access";

export const runtime = "nodejs";

const MAX_DATA_URI_LENGTH = 4_000_000;
const PREVIEW_LIMIT = 6;
const PREVIEW_WINDOW_SECONDS = 60 * 60;

function isModelKind(value: unknown): value is ModelKind {
  return value === "pop" || value === "mini" || value === "brick";
}

export async function POST(request: Request) {
  try {
    if (process.env.NEXT_PUBLIC_MOCK_AI === "true") return NextResponse.json({ error: "AI заявките са изключени в демо режим." }, { status: 403 });
    const rate = await consumeRateLimit({
      scope: "meshy-preview-hour",
      key: requestClientKey(request),
      windowSeconds: PREVIEW_WINDOW_SECONDS,
      limit: PREVIEW_LIMIT,
    });

    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((new Date(rate.resetAt).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Достигна лимита за AI визуализации. Опитай отново малко по-късно." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(PREVIEW_LIMIT),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const body = await readJson(request, MAX_DATA_URI_LENGTH + 512);
    const image = body?.image;
    const modelKind = body?.modelKind;

    if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/]+=*$/.test(image)) {
      return NextResponse.json({ error: "Невалидно изображение." }, { status: 400 });
    }
    if (!isModelKind(modelKind)) {
      return NextResponse.json({ error: "Невалиден стил на фигурката." }, { status: 400 });
    }
    if (image.length > MAX_DATA_URI_LENGTH) {
      return NextResponse.json({ error: "Снимката е твърде голяма." }, { status: 413 });
    }

    const budget = Number(process.env.PREVIEW_GLOBAL_HOURLY_LIMIT || 30);
    if (!Number.isInteger(budget) || budget < 1) throw new Error("Invalid preview budget");
    const globalRate = await consumeRateLimit({ scope: "meshy-preview-global", key: "global", windowSeconds: 3600, limit: budget });
    if (!globalRate.allowed) return NextResponse.json({ error: "Визуализациите временно са заети. Опитай по-късно." }, { status: 429, headers: { "Retry-After": "3600" } });
    const taskId = await submitPrototype(body.requestId, modelKind, image);
    return NextResponse.json(
      { taskId, accessToken: issuePreviewAccess(modelKind, taskId) },
      { headers: { "X-RateLimit-Remaining": String(rate.remaining) } }
    );
  } catch (error) {
    return publicFailure(error);
  }
}
