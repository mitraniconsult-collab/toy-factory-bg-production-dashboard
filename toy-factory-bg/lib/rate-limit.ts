import crypto from "node:crypto";

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on the server.");
  return { url, key };
}

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function requestClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "unknown";
  // User-Agent is client controlled and must not reset a paid API budget.
  return hashKey(ip);
}

export async function consumeRateLimit(input: {
  scope: string;
  key: string;
  windowSeconds: number;
  limit: number;
}): Promise<RateLimitResult> {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/consume_api_rate_limit`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_scope: input.scope,
      p_key_hash: input.key,
      p_window_seconds: input.windowSeconds,
      p_limit: input.limit,
    }),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message || body?.details || `Rate limit RPC failed with ${response.status}`;
    throw new Error(String(message));
  }

  const row = Array.isArray(body) ? body[0] : body;
  if (!row || typeof row.allowed !== "boolean") throw new Error("Rate limit RPC returned invalid data.");

  return {
    allowed: row.allowed,
    remaining: Number(row.remaining || 0),
    resetAt: String(row.reset_at || ""),
  };
}
