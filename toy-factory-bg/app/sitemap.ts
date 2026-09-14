import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return origin ? ["", "/create", "/privacy", "/terms"].map((path) => ({ url: `${origin}${path}` })) : [];
}
