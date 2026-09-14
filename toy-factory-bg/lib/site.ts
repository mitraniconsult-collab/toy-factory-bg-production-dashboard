export function siteUrl() {
  const value = process.env.SITE_URL;
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/") throw new Error("SITE_URL must be a canonical HTTPS origin");
  return url.origin;
}
