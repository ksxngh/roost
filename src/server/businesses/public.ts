import { BusinessStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";

/**
 * Public marketplace reads.
 *
 * Every query in this module filters on `status: ACTIVE`. A business in
 * DRAFT, PENDING_REVIEW, or SUSPENDED must be invisible to the public — an
 * unverified provider appearing in search would break the core promise that
 * everyone listed has been checked.
 */
const PUBLIC_FILTER = { status: BusinessStatus.ACTIVE } as const;

export type StorefrontSummary = {
  slug: string;
  name: string;
  tagline: string | null;
  categories: { slug: string; name: string }[];
  areas: { city: string; region: string }[];
};

/** One storefront by its public slug, or null when it isn't listable. */
export async function getPublicStorefront(slug: string) {
  return prisma.business.findFirst({
    where: { slug, ...PUBLIC_FILTER },
    select: {
      slug: true,
      name: true,
      timezone: true,
      // Whether this storefront can take money, so the booking page can say
      // so before the customer fills anything in.
      stripeChargesEnabled: true,
      tagline: true,
      about: true,
      phone: true,
      email: true,
      website: true,
      logoKey: true,
      verifiedAt: true,
      categories: {
        select: { category: { select: { slug: true, name: true } } },
      },
      serviceAreas: {
        select: { city: true, region: true },
        orderBy: [{ region: "asc" }, { city: "asc" }],
      },
      // Hidden packages are excluded here, not filtered in the page, so an
      // unpublished service cannot leak through a new caller.
      packages: {
        where: { active: true },
        select: {
          id: true,
          name: true,
          description: true,
          pricingModel: true,
          priceCents: true,
          durationMinutes: true,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

/**
 * Businesses serving a city, optionally narrowed to one trade.
 *
 * City and region are matched case-insensitively so "surrey"/"Surrey" and
 * "bc"/"BC" behave the same in a URL.
 */
export async function searchStorefronts(params: {
  city: string;
  region: string;
  country?: string;
  categorySlug?: string;
  limit?: number;
}): Promise<StorefrontSummary[]> {
  const rows = await prisma.business.findMany({
    where: {
      ...PUBLIC_FILTER,
      serviceAreas: {
        some: {
          city: { equals: params.city, mode: "insensitive" },
          region: { equals: params.region, mode: "insensitive" },
          country: {
            equals: params.country ?? "CA",
            mode: "insensitive",
          },
        },
      },
      ...(params.categorySlug
        ? { categories: { some: { category: { slug: params.categorySlug } } } }
        : {}),
    },
    take: params.limit ?? 50,
    orderBy: { name: "asc" },
    select: {
      slug: true,
      name: true,
      tagline: true,
      categories: {
        select: { category: { select: { slug: true, name: true } } },
      },
      serviceAreas: {
        select: { city: true, region: true },
        orderBy: [{ region: "asc" }, { city: "asc" }],
      },
    },
  });

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    categories: row.categories.map((link) => link.category),
    areas: row.serviceAreas,
  }));
}

/** All trades, for the browse page and the onboarding picker. */
export async function listServiceCategories() {
  return prisma.serviceCategory.findMany({
    orderBy: { position: "asc" },
    select: { id: true, slug: true, name: true, description: true },
  });
}
