// @vitest-environment node
/**
 * Integration tests for the business layer against the throwaway roost_test
 * database. The emphasis is on the two properties that matter most for a
 * marketplace: one business can never touch another's data, and nothing
 * unverified is ever publicly visible.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BusinessRole, BusinessStatus } from "@/generated/prisma/enums";
import {
  ForbiddenError,
  NotFoundError,
  currentMembership,
  requireEditor,
  requireMembership,
  requireOwner,
} from "@/server/businesses/access";
import {
  NotReadyError,
  addServiceArea,
  createBusiness,
  getBusiness,
  removeServiceArea,
  setCategories,
  storefrontReadiness,
  submitForReview,
  suggestSlug,
  updateProfile,
  updateSlug,
} from "@/server/businesses/businesses";
import {
  getPublicStorefront,
  listActiveStorefrontSlugs,
  listAllStorefronts,
  listServedAreas,
  listServiceCategories,
  searchStorefronts,
} from "@/server/businesses/public";
import { prisma } from "@/server/db";

let seq = 0;

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      // Better Auth owns the User model and assigns ids itself, so rows
      // created directly in tests must supply one.
      id: randomUUID(),
      name: `User ${seq}`,
      email: `owner-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeCategory(name: string) {
  seq += 1;
  return prisma.serviceCategory.create({
    data: { slug: `${name}-${seq}`, name, position: seq },
  });
}

/** A business owned by a fresh user, with one trade and one city. */
async function makeBusiness(name = "Northside Plumbing") {
  const [user, category] = await Promise.all([makeUser(), makeCategory(name)]);
  const business = await createBusiness(user.id, {
    name,
    categoryIds: [category.id],
    serviceAreas: [{ city: "Surrey", region: "BC", country: "CA" }],
  });
  return { user, category, business };
}

/** Fill in everything `storefrontReadiness` looks for. */
async function makeReady(businessId: string, uploadedById: string) {
  await prisma.business.update({
    where: { id: businessId },
    data: { about: "We fix pipes.", phone: "604-555-0142" },
  });
  await prisma.servicePackage.create({
    data: {
      businessId,
      name: "Drain unclogging",
      pricingModel: "FIXED",
      priceCents: 12_000,
      durationMinutes: 60,
    },
  });
  await prisma.businessHour.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      businessId,
      weekday,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    })),
  });
  await prisma.businessDocument.createMany({
    data: (["LICENCE", "INSURANCE"] as const).map((kind, index) => ({
      businessId,
      kind,
      title: kind,
      storageKey: `business/${businessId}/${kind}-${index}-${Date.now()}`,
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadedById,
    })),
  });
}

beforeAll(() => {
  // Never run destructive cleanup against a non-test database.
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  // Businesses and memberships cascade from these two roots.
  await prisma.business.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();
});

describe("createBusiness", () => {
  it("creates the business, an owner seat, categories, and areas together", async () => {
    const { user, business, category } = await makeBusiness();

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
      include: { members: true, categories: true, serviceAreas: true },
    });

    expect(stored.status).toBe(BusinessStatus.DRAFT);
    expect(stored.slug).toBe("northside-plumbing");
    expect(stored.members).toHaveLength(1);
    expect(stored.members[0]).toMatchObject({
      userId: user.id,
      role: BusinessRole.OWNER,
    });
    expect(stored.categories[0]!.categoryId).toBe(category.id);
    expect(stored.serviceAreas[0]).toMatchObject({
      city: "Surrey",
      region: "BC",
      country: "CA",
    });
  });

  it("never lists a new business as ACTIVE", async () => {
    const { business } = await makeBusiness();
    expect(business.status).toBe(BusinessStatus.DRAFT);
    expect(await getPublicStorefront(business.slug)).toBeNull();
  });

  it("gives the second business with the same name a distinct slug", async () => {
    const first = await makeBusiness("Elite Electric");
    const second = await makeBusiness("Elite Electric");

    expect(first.business.slug).toBe("elite-electric");
    expect(second.business.slug).toBe("elite-electric-2");
  });

  it("survives concurrent creation of identically named businesses", async () => {
    const users = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const category = await makeCategory("Roofing");

    const created = await Promise.all(
      users.map((user) =>
        createBusiness(user.id, {
          name: "Summit Roofing",
          categoryIds: [category.id],
          serviceAreas: [{ city: "Burnaby", region: "BC", country: "CA" }],
        }),
      ),
    );

    const slugs = new Set(created.map((business) => business.slug));
    expect(slugs.size).toBe(3);
  });

  it("rejects unknown category ids instead of failing on a foreign key", async () => {
    const user = await makeUser();
    await expect(
      createBusiness(user.id, {
        name: "Ghost Services",
        categoryIds: ["does-not-exist"],
        serviceAreas: [{ city: "Surrey", region: "BC", country: "CA" }],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await prisma.business.count()).toBe(0);
  });

  it("falls back to a generic slug when the name has no usable characters", async () => {
    const user = await makeUser();
    const category = await makeCategory("Cleaning");
    const business = await createBusiness(user.id, {
      name: "🚿🚿",
      categoryIds: [category.id],
      serviceAreas: [{ city: "Surrey", region: "BC", country: "CA" }],
    });
    expect(business.slug).toBe("business");
  });
});

describe("suggestSlug", () => {
  it("returns the base slug when it is free", async () => {
    expect(await suggestSlug("Northside Plumbing")).toBe("northside-plumbing");
  });

  it("skips slugs already taken", async () => {
    await makeBusiness("Elite Electric");
    expect(await suggestSlug("Elite Electric")).toBe("elite-electric-2");
  });
});

describe("authorization", () => {
  it("hides another business behind a not-found error", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");

    await expect(
      requireMembership(mine.user.id, theirs.business.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses every read and write across business boundaries", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");
    const outsider = mine.user.id;
    const target = theirs.business.id;

    await expect(getBusiness(outsider, target)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      updateProfile(outsider, target, { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateSlug(outsider, target, "hijacked"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      setCategories(outsider, target, [theirs.category.id]),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      addServiceArea(outsider, target, {
        city: "Nowhere",
        region: "BC",
        country: "CA",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(submitForReview(outsider, target)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // Nothing was written.
    const untouched = await prisma.business.findUniqueOrThrow({
      where: { id: target },
    });
    expect(untouched.name).toBe("Theirs Plumbing");
    expect(untouched.slug).toBe("theirs-plumbing");
  });

  it("lets an ADMIN edit but not act as owner", async () => {
    const { business } = await makeBusiness();
    const admin = await makeUser();
    await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: admin.id,
        role: BusinessRole.ADMIN,
      },
    });

    await expect(
      requireEditor(admin.id, business.id, "edit"),
    ).resolves.toMatchObject({ role: BusinessRole.ADMIN });
    await expect(
      requireOwner(admin.id, business.id, "delete"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a MEMBER read but not edit", async () => {
    const { business } = await makeBusiness();
    const member = await makeUser();
    await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: member.id,
        role: BusinessRole.MEMBER,
      },
    });

    await expect(getBusiness(member.id, business.id)).resolves.toMatchObject({
      id: business.id,
    });
    await expect(
      updateProfile(member.id, business.id, { name: "Renamed" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("returns the oldest membership as the current one", async () => {
    const user = await makeUser();
    const first = await makeBusiness("First Trades");
    const second = await makeBusiness("Second Trades");
    await prisma.businessMember.create({
      data: {
        businessId: second.business.id,
        userId: user.id,
        role: BusinessRole.MEMBER,
      },
    });
    await prisma.businessMember.create({
      data: {
        businessId: first.business.id,
        userId: user.id,
        role: BusinessRole.MEMBER,
      },
    });

    const membership = await currentMembership(user.id);
    expect(membership?.businessId).toBe(second.business.id);
  });

  it("returns null for a user with no business", async () => {
    const user = await makeUser();
    expect(await currentMembership(user.id)).toBeNull();
  });
});

describe("updateProfile", () => {
  it("stores the profile and clears fields set to null", async () => {
    const { user, business } = await makeBusiness();

    await updateProfile(user.id, business.id, {
      name: "Northside Plumbing Ltd",
      tagline: "Same-day repairs",
      about: "Twenty years on the tools.",
      phone: "604-555-0142",
      email: "hello@northside.example",
      website: "https://northside.example",
    });
    await updateProfile(user.id, business.id, {
      name: "Northside Plumbing Ltd",
      tagline: null,
      about: null,
      phone: null,
      email: null,
      website: null,
    });

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.name).toBe("Northside Plumbing Ltd");
    expect(stored.tagline).toBeNull();
    expect(stored.website).toBeNull();
  });

  it("does not change the slug when the name changes", async () => {
    const { user, business } = await makeBusiness();
    await updateProfile(user.id, business.id, { name: "Completely New Name" });

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.slug).toBe("northside-plumbing");
  });
});

describe("updateSlug", () => {
  it("changes the public address", async () => {
    const { user, business } = await makeBusiness();
    await updateSlug(user.id, business.id, "northside-pipes");

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.slug).toBe("northside-pipes");
  });

  it("rejects a slug another business already holds", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");

    await expect(
      updateSlug(mine.user.id, mine.business.id, theirs.business.slug),
    ).rejects.toMatchObject({ name: "DuplicateSlugError" });
  });
});

describe("service areas and categories", () => {
  it("adds an area and treats a duplicate as a no-op", async () => {
    const { user, business } = await makeBusiness();
    const area = { city: "Langley", region: "BC", country: "CA" };

    await addServiceArea(user.id, business.id, area);
    await addServiceArea(user.id, business.id, area);

    const stored = await prisma.serviceArea.findMany({
      where: { businessId: business.id, city: "Langley" },
    });
    expect(stored).toHaveLength(1);
  });

  it("refuses to remove an area belonging to another business", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");
    const theirArea = await prisma.serviceArea.findFirstOrThrow({
      where: { businessId: theirs.business.id },
    });

    await removeServiceArea(mine.user.id, mine.business.id, theirArea.id);

    expect(
      await prisma.serviceArea.findUnique({ where: { id: theirArea.id } }),
    ).not.toBeNull();
  });

  it("replaces the set of categories", async () => {
    const { user, business } = await makeBusiness();
    const [drywall, painting] = await Promise.all([
      makeCategory("Drywall"),
      makeCategory("Painting"),
    ]);

    await setCategories(user.id, business.id, [drywall.id, painting.id]);

    const stored = await prisma.businessCategory.findMany({
      where: { businessId: business.id },
    });
    expect(stored.map((row) => row.categoryId).sort()).toEqual(
      [drywall.id, painting.id].sort(),
    );
  });

  it("rejects an unknown category without clearing the existing ones", async () => {
    const { user, business, category } = await makeBusiness();

    await expect(
      setCategories(user.id, business.id, ["nope"]),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stored = await prisma.businessCategory.findMany({
      where: { businessId: business.id },
    });
    expect(stored.map((row) => row.categoryId)).toEqual([category.id]);
  });
});

describe("storefrontReadiness and submitForReview", () => {
  it("reports every outstanding step for a fresh business", async () => {
    const { user, business } = await makeBusiness();
    const checks = await storefrontReadiness(user.id, business.id);

    expect(checks.map((check) => check.key)).toEqual([
      "profile",
      "categories",
      "areas",
      "packages",
      "hours",
      "licence",
      "insurance",
    ]);
    expect(
      checks.filter((check) => check.done).map((check) => check.key),
    ).toEqual(["categories", "areas"]);
  });

  it("refuses to submit until every step is done", async () => {
    const { user, business } = await makeBusiness();

    await expect(submitForReview(user.id, business.id)).rejects.toBeInstanceOf(
      NotReadyError,
    );

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.status).toBe(BusinessStatus.DRAFT);
  });

  it("lists what is still missing on the error", async () => {
    const { user, business } = await makeBusiness();
    const error = await submitForReview(user.id, business.id).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(NotReadyError);
    // profile, packages, hours, licence, insurance
    expect((error as NotReadyError).missing).toHaveLength(5);
  });

  it("moves a ready business to PENDING_REVIEW, never straight to ACTIVE", async () => {
    const { user, business } = await makeBusiness();
    await makeReady(business.id, user.id);

    await submitForReview(user.id, business.id);

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.status).toBe(BusinessStatus.PENDING_REVIEW);
    // Still invisible: only an admin review makes it public.
    expect(await getPublicStorefront(stored.slug)).toBeNull();
  });
});

describe("public queries", () => {
  async function makeActive(name: string, city = "Surrey") {
    const user = await makeUser();
    const category = await makeCategory(name);
    const business = await createBusiness(user.id, {
      name,
      categoryIds: [category.id],
      serviceAreas: [{ city, region: "BC", country: "CA" }],
    });
    await prisma.business.update({
      where: { id: business.id },
      data: { status: BusinessStatus.ACTIVE, verifiedAt: new Date() },
    });
    return { user, category, business };
  }

  it("returns an ACTIVE storefront by slug", async () => {
    const { business } = await makeActive("Bright Sparks");
    const storefront = await getPublicStorefront(business.slug);

    expect(storefront?.name).toBe("Bright Sparks");
    expect(storefront?.serviceAreas).toEqual([
      { city: "Surrey", region: "BC" },
    ]);
  });

  it("lists only ACTIVE storefront slugs for the sitemap", async () => {
    const active = await makeActive("Sitemap Sparks");
    const draft = await makeActive("Sitemap Drafts");
    await prisma.business.update({
      where: { id: draft.business.id },
      data: { status: BusinessStatus.DRAFT },
    });

    const slugs = (await listActiveStorefrontSlugs()).map((b) => b.slug);
    expect(slugs).toContain(active.business.slug);
    expect(slugs).not.toContain(draft.business.slug);
  });

  it.each([
    BusinessStatus.DRAFT,
    BusinessStatus.PENDING_REVIEW,
    BusinessStatus.SUSPENDED,
  ])("hides a %s business from both slug lookup and search", async (status) => {
    const { business } = await makeActive("Hidden Trades");
    await prisma.business.update({
      where: { id: business.id },
      data: { status },
    });

    expect(await getPublicStorefront(business.slug)).toBeNull();
    expect(
      await searchStorefronts({ city: "Surrey", region: "BC" }),
    ).toHaveLength(0);
  });

  it("never exposes internal columns on a storefront", async () => {
    const { business } = await makeActive("Bright Sparks");
    const storefront = await getPublicStorefront(business.slug);

    expect(storefront).not.toHaveProperty("id");
    expect(storefront).not.toHaveProperty("status");
    expect(storefront).not.toHaveProperty("insuredUntil");
  });

  it("matches city and region case-insensitively", async () => {
    await makeActive("Bright Sparks");
    const results = await searchStorefronts({ city: "surrey", region: "bc" });
    expect(results.map((row) => row.name)).toEqual(["Bright Sparks"]);
  });

  it("lists every active storefront regardless of area", async () => {
    const a = await makeActive("All Trades A", "Surrey");
    const b = await makeActive("All Trades B", "Burnaby");
    const draft = await makeActive("All Trades Draft", "Surrey");
    await prisma.business.update({
      where: { id: draft.business.id },
      data: { status: BusinessStatus.DRAFT },
    });

    const names = (await listAllStorefronts()).map((row) => row.name);
    expect(names).toContain(a.business.name);
    expect(names).toContain(b.business.name);
    expect(names).not.toContain(draft.business.name);
  });

  it("returns only areas served by an active business, deduped", async () => {
    await makeActive("Area One", "Surrey");
    await makeActive("Area Two", "Surrey"); // same area — must not double up
    await makeActive("Area Three", "Burnaby");
    const draft = await makeActive("Area Draft", "Kelowna");
    await prisma.business.update({
      where: { id: draft.business.id },
      data: { status: BusinessStatus.DRAFT },
    });

    const areas = await listServedAreas();
    const cities = areas.map((area) => area.city);
    expect(cities.filter((c) => c === "Surrey")).toHaveLength(1);
    expect(cities).toContain("Burnaby");
    expect(cities).not.toContain("Kelowna"); // draft business excluded
  });

  it("does not match a different city", async () => {
    await makeActive("Bright Sparks", "Surrey");
    expect(
      await searchStorefronts({ city: "Kelowna", region: "BC" }),
    ).toHaveLength(0);
  });

  it("narrows results by category", async () => {
    const plumber = await makeActive("Northside Plumbing");
    await makeActive("Bright Sparks");

    const results = await searchStorefronts({
      city: "Surrey",
      region: "BC",
      categorySlug: plumber.category.slug,
    });
    expect(results.map((row) => row.name)).toEqual(["Northside Plumbing"]);
  });

  it("honours the result limit", async () => {
    await makeActive("Alpha Trades");
    await makeActive("Beta Trades");
    await makeActive("Gamma Trades");

    const results = await searchStorefronts({
      city: "Surrey",
      region: "BC",
      limit: 2,
    });
    expect(results).toHaveLength(2);
  });

  it("orders categories for the picker by position", async () => {
    await makeCategory("Second");
    await makeCategory("Third");
    const listed = await listServiceCategories();
    expect(listed.map((row) => row.name)).toEqual(["Second", "Third"]);
  });
});
