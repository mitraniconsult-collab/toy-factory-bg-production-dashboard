import { NextResponse } from "next/server";
import { setAdminSessionCookie, verifyAdminPassword } from "@/lib/admin-auth";
import { consumeRateLimit, requestClientKey } from "@/lib/rate-limit";
import { readJson, publicFailure } from "@/lib/http";

export const runtime = "nodejs";

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  try {
    const rate = await consumeRateLimit({
      scope: "admin-login",
      key: requestClientKey(request),
      windowSeconds: LOGIN_WINDOW_SECONDS,
      limit: LOGIN_LIMIT,
    });

    if (!rate.allowed) {
      const retryAfter = Math.max(1, Math.ceil((new Date(rate.resetAt).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Твърде много опити за вход. Опитай отново по-късно." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await readJson(request);
    if (!verifyAdminPassword(String(body?.password || ""))) {
      return NextResponse.json({ error: "Грешна парола." }, { status: 401 });
    }
    await setAdminSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return publicFailure(error);
  }
}
