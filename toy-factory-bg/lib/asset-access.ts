import crypto from "node:crypto";

function accessSecret() {
  const secret = process.env.ASSET_PROXY_SECRET || process.env.CRON_SECRET || process.env.MESHY_WEBHOOK_SECRET;
  if (!secret) throw new Error("ASSET_PROXY_SECRET, CRON_SECRET or MESHY_WEBHOOK_SECRET is required for temporary asset access.");
  return secret;
}

function signaturePayload(path: string, expiresAt: number) {
  return `${expiresAt}:${path}`;
}

export function signAssetAccess(path: string, expiresInSeconds = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signature = crypto
    .createHmac("sha256", accessSecret())
    .update(signaturePayload(path, expiresAt))
    .digest("hex");
  return { expiresAt, signature };
}

export function verifyAssetAccess(path: string, expiresAt: number, signature: string) {
  if (!path || !Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signature) return false;
  const expected = crypto
    .createHmac("sha256", accessSecret())
    .update(signaturePayload(path, expiresAt))
    .digest("hex");
  const providedBytes = Buffer.from(signature, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return providedBytes.length === expectedBytes.length && crypto.timingSafeEqual(providedBytes, expectedBytes);
}

export function createTemporaryAssetUrl(origin: string, path: string, expiresInSeconds = 3600) {
  const { expiresAt, signature } = signAssetAccess(path, expiresInSeconds);
  const filename = path.split("/").pop() || "asset";
  const url = new URL(`/api/assets/private/${encodeURIComponent(filename)}`, origin);
  url.searchParams.set("path", path);
  url.searchParams.set("exp", String(expiresAt));
  url.searchParams.set("sig", signature);
  return url.toString();
}
