import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site-config";
import {
  listActiveStorefrontSlugs,
  listServiceCategories,
} from "@/server/businesses/public";

// The storefront set changes as businesses are approved, so the sitemap is
// generated per request rather than baked at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/legal/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/legal/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const [storefronts, categories] = await Promise.all([
    listActiveStorefrontSlugs(),
    listServiceCategories(),
  ]);

  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${base}/browse?category=${category.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const storefrontPages: MetadataRoute.Sitemap = storefronts.map(
    (business) => ({
      url: `${base}/pro/${business.slug}`,
      lastModified: business.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    }),
  );

  return [...staticPages, ...categoryPages, ...storefrontPages];
}
