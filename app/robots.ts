import type { MetadataRoute } from "next";
import { isProductionSite, siteUrl } from "@/lib/site";

/** Production is indexable except signed-in areas; staging and local
 * copies are hidden from search engines entirely. */
export default function robots(): MetadataRoute.Robots {
  if (!isProductionSite()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/expert/", "/dashboard", "/booking", "/book/", "/auth", "/api", "/dev"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
