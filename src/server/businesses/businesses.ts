import { BusinessRole, BusinessStatus } from "@/generated/prisma/enums";
import type { BusinessModel } from "@/generated/prisma/models";
import type {
  CreateBusinessInput,
  ServiceAreaInput,
  UpdateBusinessProfileInput,
} from "@/lib/validations/business";
import { slugify } from "@/lib/validations/business";
import { prisma } from "@/server/db";
import {
  DuplicateSlugError,
  NotFoundError,
  requireEditor,
  requireMembership,
} from "@/server/businesses/access";

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2002";
}

/**
 * Pick an unused storefront slug derived from the business name.
 *
 * Uniqueness is ultimately enforced by the database, so this is an
 * optimization, not the guarantee — `createBusiness` still retries on a
 * unique violation to stay correct when two businesses register the same
 * name concurrently.
 */
export async function suggestSlug(name: string): Promise<string> {
  const base = slugify(name) || "business";
  const taken = await prisma.business.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Create a business and make the creator its owner.
 *
 * The business, the owner's seat, the trades, and the coverage areas are
 * written in one transaction: a business with no owner would be permanently
 * unreachable, since membership is the only way in.
 */
export async function createBusiness(
  userId: string,
  input: CreateBusinessInput,
): Promise<BusinessModel> {
  // Reject unknown category ids up front rather than letting a foreign-key
  // error surface as an opaque failure.
  const categories = await prisma.serviceCategory.findMany({
    where: { id: { in: input.categoryIds } },
    select: { id: true },
  });
  if (categories.length !== input.categoryIds.length) {
    throw new NotFoundError("service");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = await suggestSlug(input.name);
    try {
      return await prisma.business.create({
        data: {
          name: input.name,
          slug,
          status: BusinessStatus.DRAFT,
          members: { create: { userId, role: BusinessRole.OWNER } },
          categories: {
            create: input.categoryIds.map((categoryId) => ({ categoryId })),
          },
          serviceAreas: { create: input.serviceAreas },
        },
      });
    } catch (error) {
      // Another business claimed the slug between suggestion and insert.
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new DuplicateSlugError();
}

export type BusinessDetail = Awaited<ReturnType<typeof getBusiness>>;

/** Full business record for the provider's own dashboard. */
export async function getBusiness(userId: string, businessId: string) {
  await requireMembership(userId, businessId);
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      categories: { include: { category: true } },
      serviceAreas: { orderBy: [{ region: "asc" }, { city: "asc" }] },
      packages: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      hours: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!business) {
    throw new NotFoundError();
  }
  return business;
}

export async function updateProfile(
  userId: string,
  businessId: string,
  input: UpdateBusinessProfileInput,
): Promise<void> {
  await requireEditor(userId, businessId, "edit this business");
  await prisma.business.update({
    where: { id: businessId },
    data: {
      name: input.name,
      tagline: input.tagline ?? null,
      about: input.about ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      website: input.website ?? null,
    },
  });
}

/**
 * Change the public storefront address.
 *
 * Separate from `updateProfile` because it breaks existing links — the UI
 * warns before calling it, and only editors may do it.
 */
export async function updateSlug(
  userId: string,
  businessId: string,
  slug: string,
): Promise<void> {
  await requireEditor(userId, businessId, "change the storefront address");
  try {
    await prisma.business.update({ where: { id: businessId }, data: { slug } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateSlugError();
    }
    throw error;
  }
}

/** Replace the set of trades this business offers. */
export async function setCategories(
  userId: string,
  businessId: string,
  categoryIds: string[],
): Promise<void> {
  await requireEditor(userId, businessId, "change the services offered");
  const known = await prisma.serviceCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true },
  });
  if (known.length !== categoryIds.length) {
    throw new NotFoundError("service");
  }
  await prisma.$transaction([
    prisma.businessCategory.deleteMany({ where: { businessId } }),
    prisma.businessCategory.createMany({
      data: categoryIds.map((categoryId) => ({ businessId, categoryId })),
    }),
  ]);
}

export async function addServiceArea(
  userId: string,
  businessId: string,
  area: ServiceAreaInput,
): Promise<void> {
  await requireEditor(userId, businessId, "change the areas served");
  try {
    await prisma.serviceArea.create({ data: { businessId, ...area } });
  } catch (error) {
    // Re-adding the same city is a no-op, not an error worth surfacing.
    if (!isUniqueViolation(error)) throw error;
  }
}

export async function removeServiceArea(
  userId: string,
  businessId: string,
  areaId: string,
): Promise<void> {
  await requireEditor(userId, businessId, "change the areas served");
  // Scoped by businessId so an id from another business cannot be deleted.
  await prisma.serviceArea.deleteMany({ where: { id: areaId, businessId } });
}

/**
 * What still stands between this business and being listed. Drives the
 * onboarding checklist and gates submission for review.
 */
export type ReadinessCheck = {
  key: string;
  label: string;
  done: boolean;
};

export async function storefrontReadiness(
  userId: string,
  businessId: string,
): Promise<ReadinessCheck[]> {
  const business = await getBusiness(userId, businessId);
  return [
    {
      key: "profile",
      label: "Add a description and contact details",
      done: Boolean(business.about && business.phone),
    },
    {
      key: "categories",
      label: "Choose the services you offer",
      done: business.categories.length > 0,
    },
    {
      key: "areas",
      label: "Set the areas you serve",
      done: business.serviceAreas.length > 0,
    },
    {
      key: "packages",
      // Being listed with nothing bookable wastes the customer's click.
      label: "Publish at least one bookable service",
      done: business.packages.some((servicePackage) => servicePackage.active),
    },
    {
      key: "hours",
      label: "Set the hours you work",
      done: business.hours.length > 0,
    },
    {
      key: "licence",
      label: "Upload your licence or registration",
      done: business.documents.some((doc) => doc.kind === "LICENCE"),
    },
    {
      key: "insurance",
      label: "Upload proof of insurance",
      done: business.documents.some((doc) => doc.kind === "INSURANCE"),
    },
  ];
}

/**
 * Submit for verification. Deliberately does not set ACTIVE — only an admin
 * review can do that, so a business cannot list itself unverified.
 */
export async function submitForReview(
  userId: string,
  businessId: string,
): Promise<void> {
  await requireEditor(userId, businessId, "submit this business for review");
  const checks = await storefrontReadiness(userId, businessId);
  const missing = checks.filter((check) => !check.done);
  if (missing.length > 0) {
    throw new NotReadyError(missing.map((check) => check.label));
  }
  await prisma.business.update({
    where: { id: businessId },
    data: { status: BusinessStatus.PENDING_REVIEW },
  });
}

export class NotReadyError extends Error {
  constructor(readonly missing: string[]) {
    super(`Still needed before review: ${missing.join(", ")}.`);
    this.name = "NotReadyError";
  }
}
