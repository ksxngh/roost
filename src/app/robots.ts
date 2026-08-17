import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site-config";

/**
 * robots.txt. Everything public is crawlable; the authenticated app, the admin
 * surface, and the API are kept out of the index — they hold no content worth
 * crawling and should not appear in search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/dashboard",
        "/schedule",
        "/clients",
        "/quotes",
        "/invoices",
        "/settings",
        "/storefront",
        "/onboarding",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
