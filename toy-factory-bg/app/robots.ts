import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  return { rules: { userAgent: "*", ...(origin ? { allow: "/", disallow: ["/admin", "/api/", "/create/preview"] } : { disallow: "/" }) }, ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
