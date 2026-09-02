import { Prisma } from "@/generated/prisma/client";
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

/** The fields every storefront card needs; shared by search and browse-all. */
const SUMMARY_SELECT = {
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
} satisfies Prisma.BusinessSelect;

type SummaryRow = Prisma.BusinessGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummary(row: SummaryRow): StorefrontSummary {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    categories: row.categories.map((link) => link.category),
    areas: row.serviceAreas,
  };
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
    select: SUMMARY_SELECT,
  });

  return rows.map(toSummary);
}

/**
 * Every listed business, optionally narrowed to one trade. Powers the browse
 * page before a visitor has chosen an area, so the marketplace never opens on
 * an empty screen.
 */
export async function listAllStorefronts(
  params: { categorySlug?: string; limit?: number } = {},
): Promise<StorefrontSummary[]> {
  const rows = await prisma.business.findMany({
    where: {
      ...PUBLIC_FILTER,
      ...(params.categorySlug
        ? { categories: { some: { category: { slug: params.categorySlug } } } }
        : {}),
    },
    take: params.limit ?? 60,
    orderBy: { name: "asc" },
    select: SUMMARY_SELECT,
  });

  return rows.map(toSummary);
}

/**
 * Distinct city/region pairs that at least one listed business serves — the
 * options for the header's area picker. Only areas with real listings are
 * offered, so a visitor can never pick a location that returns nothing.
 */
export async function listServedAreas(): Promise<
  { city: string; region: string }[]
> {
  return prisma.serviceArea.findMany({
    where: { business: PUBLIC_FILTER },
    distinct: ["city", "region"],
    orderBy: [{ region: "asc" }, { city: "asc" }],
    select: { city: true, region: true },
  });
}

/** All trades, for the browse page and the onboarding picker. */
export async function listServiceCategories() {
  return prisma.serviceCategory.findMany({
    orderBy: { position: "asc" },
    select: { id: true, slug: true, name: true, description: true },
  });
}

/**
 * Slugs of every publicly listed storefront, for the sitemap. Only ACTIVE
 * businesses are included — the same visibility rule the public pages enforce,
 * so the sitemap never advertises a draft or suspended business.
 */
export async function listActiveStorefrontSlugs() {
  return prisma.business.findMany({
    where: { status: BusinessStatus.ACTIVE },
    orderBy: { updatedAt: "desc" },
    select: { slug: true, updatedAt: true },
  });
}
