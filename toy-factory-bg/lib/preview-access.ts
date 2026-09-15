import { signAssetAccess, verifyAssetAccess } from "@/lib/asset-access";
export function issuePreviewAccess(kind: string, taskId: string) {
  const token = signAssetAccess(`preview:${kind}:${taskId}`, 3600);
  return `${token.expiresAt}.${token.signature}`;
}
export function verifyPreviewAccess(kind: string, taskId: string, token: unknown) {
  if (typeof token !== "string") return false;
  const [expires, signature] = token.split(".");
  return verifyAssetAccess(`preview:${kind}:${taskId}`, Number(expires), signature || "");
}
