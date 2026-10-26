import type { MetadataRoute } from "next";
import { getDirectoryForRequest } from "@/lib/public/cached";
import { isProductionSite, siteUrl } from "@/lib/site";

export const revalidate = 3600;

const PAGES = ["", "/experts", "/become-an-expert", "/about", "/help", "/contact", "/terms", "/privacy", "/expert-terms"];

/** Public pages plus every published expert profile (production only). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  if (!isProductionSite() || !base) return [];
  const experts = await getDirectoryForRequest();
  return [
    ...PAGES.map((path) => ({ url: `${base}${path}` })),
    ...experts.map((expert) => ({ url: `${base}/experts/${expert.slug}` })),
  ];
}
