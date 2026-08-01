// @vitest-environment node
/**
 * Services and availability against the real database. The emphasis is the
 * same as everywhere else in this layer: another business's rows are
 * untouchable, and nothing unpublished reaches a customer.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BusinessRole, BusinessStatus } from "@/generated/prisma/enums";
import { utcMidnightToDateKey, wallTimeAt } from "@/lib/time";
import { ForbiddenError, NotFoundError } from "@/server/businesses/access";
import {
  addException,
  getWeeklyHours,
  listExceptions,
  previewAvailability,
  publicAvailability,
  removeException,
  setWeeklyHours,
  updateBookingSettings,
} from "@/server/businesses/availability";
import {
  createBusiness,
  storefrontReadiness,
} from "@/server/businesses/businesses";
import {
  MAX_PACKAGES,
  TooManyPackagesError,
  createPackage,
  deletePackage,
  listPackages,
  reorderPackages,
  updatePackage,
} from "@/server/businesses/packages";
import { getPublicStorefront } from "@/server/businesses/public";
import { prisma } from "@/server/db";

const VANCOUVER = "America/Vancouver";

let seq = 0;

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `sched-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeBusiness(name = "Northside Plumbing") {
  seq += 1;
  const user = await makeUser();
  const category = await prisma.serviceCategory.create({
    data: { slug: `trade-${seq}`, name: `Trade ${seq}`, position: seq },
  });
  const business = await createBusiness(user.id, {
    name,
    categoryIds: [category.id],
    serviceAreas: [{ city: "Surrey", region: "BC", country: "CA" }],
  });
  return { user, category, business };
}

const HOUR_SERVICE = {
  name: "Drain unclogging",
  description: null,
  categoryId: null,
  pricingModel: "FIXED" as const,
  priceCents: 12_000,
  durationMinutes: 60,
  bufferMinutes: 0,
  active: true,
};

/** Monday–Friday, 9–5. */
const WEEKDAY_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.business.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();
});

describe("service packages", () => {
  it("creates a package and appends it to the list", async () => {
    const { user, business } = await makeBusiness();

    const first = await createPackage(user.id, business.id, HOUR_SERVICE);
    const second = await createPackage(user.id, business.id, {
      ...HOUR_SERVICE,
      name: "Tap replacement",
    });

    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect(first.priceCents).toBe(12_000);
    expect(
      (await listPackages(user.id, business.id)).map((row) => row.name),
    ).toEqual(["Drain unclogging", "Tap replacement"]);
  });

  it("stores no price for quote-priced work, whatever was submitted", async () => {
    const { user, business } = await makeBusiness();
    const created = await createPackage(user.id, business.id, {
      ...HOUR_SERVICE,
      pricingModel: "QUOTE",
      priceCents: 99_999,
    });
    expect(created.priceCents).toBeNull();
  });

  it("rejects a category that does not exist", async () => {
    const { user, business } = await makeBusiness();
    await expect(
      createPackage(user.id, business.id, {
        ...HOUR_SERVICE,
        categoryId: "nope",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("caps how many services a business can list", async () => {
    const { user, business } = await makeBusiness();
    await prisma.servicePackage.createMany({
      data: Array.from({ length: MAX_PACKAGES }, (_, index) => ({
        businessId: business.id,
        name: `Service ${index}`,
        pricingModel: "FIXED" as const,
        priceCents: 1000,
        durationMinutes: 60,
        position: index,
      })),
    });

    await expect(
      createPackage(user.id, business.id, HOUR_SERVICE),
    ).rejects.toBeInstanceOf(TooManyPackagesError);
  });

  it("updates a package in place", async () => {
    const { user, business } = await makeBusiness();
    const created = await createPackage(user.id, business.id, HOUR_SERVICE);

    await updatePackage(user.id, business.id, created.id, {
      ...HOUR_SERVICE,
      name: "Drain unclogging (deluxe)",
      priceCents: 18_000,
      durationMinutes: 90,
    });

    const stored = await prisma.servicePackage.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.name).toBe("Drain unclogging (deluxe)");
    expect(stored.priceCents).toBe(18_000);
    expect(stored.durationMinutes).toBe(90);
  });

  it("refuses to update another business's package", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");
    const target = await createPackage(
      theirs.user.id,
      theirs.business.id,
      HOUR_SERVICE,
    );

    await expect(
      updatePackage(mine.user.id, mine.business.id, target.id, {
        ...HOUR_SERVICE,
        name: "Hijacked",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stored = await prisma.servicePackage.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(stored.name).toBe("Drain unclogging");
  });

  it("leaves another business's package in place on delete", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");
    const target = await createPackage(
      theirs.user.id,
      theirs.business.id,
      HOUR_SERVICE,
    );

    await deletePackage(mine.user.id, mine.business.id, target.id);

    expect(
      await prisma.servicePackage.findUnique({ where: { id: target.id } }),
    ).not.toBeNull();
  });

  it("refuses package edits from a MEMBER", async () => {
    const { business } = await makeBusiness();
    const member = await makeUser();
    await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: member.id,
        role: BusinessRole.MEMBER,
      },
    });

    await expect(
      createPackage(member.id, business.id, HOUR_SERVICE),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reorders packages and ignores ids from elsewhere", async () => {
    const { user, business } = await makeBusiness();
    const theirs = await makeBusiness("Theirs Plumbing");
    const foreign = await createPackage(
      theirs.user.id,
      theirs.business.id,
      HOUR_SERVICE,
    );
    const a = await createPackage(user.id, business.id, HOUR_SERVICE);
    const b = await createPackage(user.id, business.id, {
      ...HOUR_SERVICE,
      name: "Tap replacement",
    });

    await reorderPackages(user.id, business.id, [b.id, foreign.id, a.id]);

    const ordered = await listPackages(user.id, business.id);
    expect(ordered.map((row) => row.name)).toEqual([
      "Tap replacement",
      "Drain unclogging",
    ]);
    // The foreign row kept its own position rather than being renumbered.
    expect(
      (
        await prisma.servicePackage.findUniqueOrThrow({
          where: { id: foreign.id },
        })
      ).position,
    ).toBe(0);
  });

  it("keeps the package when its category is deleted", async () => {
    const { user, business, category } = await makeBusiness();
    const created = await createPackage(user.id, business.id, {
      ...HOUR_SERVICE,
      categoryId: category.id,
    });

    await prisma.serviceCategory.delete({ where: { id: category.id } });

    const stored = await prisma.servicePackage.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.categoryId).toBeNull();
  });
});

describe("weekly hours", () => {
  it("replaces the schedule wholesale", async () => {
    const { user, business } = await makeBusiness();

    await setWeeklyHours(user.id, business.id, WEEKDAY_HOURS);
    await setWeeklyHours(user.id, business.id, [
      { weekday: 6, startMinute: 10 * 60, endMinute: 14 * 60 },
    ]);

    const stored = await getWeeklyHours(user.id, business.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ weekday: 6, startMinute: 600 });
  });

  it("stores split shifts as separate windows", async () => {
    const { user, business } = await makeBusiness();
    await setWeeklyHours(user.id, business.id, [
      { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 },
      { weekday: 1, startMinute: 13 * 60, endMinute: 17 * 60 },
    ]);

    const stored = await getWeeklyHours(user.id, business.id);
    expect(stored.map((hour) => hour.startMinute)).toEqual([480, 780]);
  });

  it("clears the schedule when given nothing", async () => {
    const { user, business } = await makeBusiness();
    await setWeeklyHours(user.id, business.id, WEEKDAY_HOURS);
    await setWeeklyHours(user.id, business.id, []);
    expect(await getWeeklyHours(user.id, business.id)).toEqual([]);
  });

  it("refuses to read or write another business's hours", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");
    await setWeeklyHours(theirs.user.id, theirs.business.id, WEEKDAY_HOURS);

    await expect(
      getWeeklyHours(mine.user.id, theirs.business.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      setWeeklyHours(mine.user.id, theirs.business.id, []),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(
      await prisma.businessHour.count({
        where: { businessId: theirs.business.id },
      }),
    ).toBe(5);
  });
});

describe("closed days", () => {
  it("stores a closure as a plain calendar date", async () => {
    const { user, business } = await makeBusiness();
    await addException(user.id, business.id, {
      date: "2026-12-25",
      note: "Christmas",
    });

    const [stored] = await listExceptions(user.id, business.id);
    expect(utcMidnightToDateKey(stored!.date)).toBe("2026-12-25");
    expect(stored!.note).toBe("Christmas");
  });

  it("treats adding the same day twice as an update, not an error", async () => {
    const { user, business } = await makeBusiness();
    await addException(user.id, business.id, { date: "2026-12-25" });
    await addException(user.id, business.id, {
      date: "2026-12-25",
      note: "Statutory holiday",
    });

    const stored = await listExceptions(user.id, business.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.note).toBe("Statutory holiday");
  });

  it("filters out days before the requested start", async () => {
    const { user, business } = await makeBusiness();
    await addException(user.id, business.id, { date: "2026-01-01" });
    await addException(user.id, business.id, { date: "2026-12-25" });

    const upcoming = await listExceptions(user.id, business.id, {
      from: "2026-06-01",
    });
    expect(upcoming.map((row) => utcMidnightToDateKey(row.date))).toEqual([
      "2026-12-25",
    ]);
  });

  it("leaves another business's closure alone", async () => {
    const mine = await makeBusiness("Mine Plumbing");
    const theirs = await makeBusiness("Theirs Plumbing");
    await addException(theirs.user.id, theirs.business.id, {
      date: "2026-12-25",
    });
    const [target] = await listExceptions(theirs.user.id, theirs.business.id);

    await removeException(mine.user.id, mine.business.id, target!.id);

    expect(
      await listExceptions(theirs.user.id, theirs.business.id),
    ).toHaveLength(1);
  });
});

describe("booking settings", () => {
  it("stores the timezone and booking window", async () => {
    const { user, business } = await makeBusiness();
    await updateBookingSettings(user.id, business.id, {
      timezone: "America/Toronto",
      bookingLeadHours: 48,
      bookingHorizonDays: 14,
    });

    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.timezone).toBe("America/Toronto");
    expect(stored.bookingLeadHours).toBe(48);
    expect(stored.bookingHorizonDays).toBe(14);
  });

  it("defaults a new business to Vancouver with a day's notice", async () => {
    const { business } = await makeBusiness();
    const stored = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(stored.timezone).toBe(VANCOUVER);
    expect(stored.bookingLeadHours).toBe(24);
    expect(stored.bookingHorizonDays).toBe(30);
  });
});

describe("previewAvailability", () => {
  async function bookableBusiness() {
    const { user, business } = await makeBusiness();
    await setWeeklyHours(user.id, business.id, WEEKDAY_HOURS);
    await updateBookingSettings(user.id, business.id, {
      timezone: VANCOUVER,
      bookingLeadHours: 0,
      bookingHorizonDays: 30,
    });
    const servicePackage = await createPackage(
      user.id,
      business.id,
      HOUR_SERVICE,
    );
    return { user, business, servicePackage };
  }

  it("returns real slots inside the opening hours", async () => {
    const { user, business, servicePackage } = await bookableBusiness();

    const days = await previewAvailability(
      user.id,
      business.id,
      servicePackage.id,
      { days: 7, now: new Date("2026-08-03T00:00:00Z") },
    );

    const monday = days.find((day) => day.weekday === 1)!;
    expect(monday.slots.length).toBeGreaterThan(0);
    expect(wallTimeAt(monday.slots[0]!, VANCOUVER).minutes).toBe(9 * 60);
  });

  it("honours a closed day", async () => {
    const { user, business, servicePackage } = await bookableBusiness();
    const days = await previewAvailability(
      user.id,
      business.id,
      servicePackage.id,
      { days: 7, now: new Date("2026-08-03T00:00:00Z") },
    );
    const target = days.find((day) => day.slots.length > 0)!.date;

    await addException(user.id, business.id, { date: target });

    const after = await previewAvailability(
      user.id,
      business.id,
      servicePackage.id,
      { days: 7, now: new Date("2026-08-03T00:00:00Z") },
    );
    expect(after.find((day) => day.date === target)!.slots).toEqual([]);
  });

  it("never returns more days than the business's horizon", async () => {
    const { user, business, servicePackage } = await bookableBusiness();
    await updateBookingSettings(user.id, business.id, {
      timezone: VANCOUVER,
      bookingLeadHours: 0,
      bookingHorizonDays: 3,
    });

    const days = await previewAvailability(
      user.id,
      business.id,
      servicePackage.id,
      { days: 30 },
    );
    expect(days).toHaveLength(3);
  });

  it("rejects a package belonging to another business", async () => {
    const mine = await bookableBusiness();
    const theirs = await makeBusiness("Theirs Plumbing");
    const foreign = await createPackage(
      theirs.user.id,
      theirs.business.id,
      HOUR_SERVICE,
    );

    await expect(
      previewAvailability(mine.user.id, mine.business.id, foreign.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a caller who is not a member", async () => {
    const mine = await bookableBusiness();
    const stranger = await makeUser();

    await expect(
      previewAvailability(
        stranger.id,
        mine.business.id,
        mine.servicePackage.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("publicAvailability", () => {
  async function listedBusiness() {
    const { user, business } = await makeBusiness();
    await setWeeklyHours(user.id, business.id, WEEKDAY_HOURS);
    await updateBookingSettings(user.id, business.id, {
      timezone: VANCOUVER,
      bookingLeadHours: 0,
      bookingHorizonDays: 30,
    });
    const servicePackage = await createPackage(
      user.id,
      business.id,
      HOUR_SERVICE,
    );
    await prisma.business.update({
      where: { id: business.id },
      data: { status: BusinessStatus.ACTIVE },
    });
    return { user, business, servicePackage };
  }

  it("returns slots for a listed business", async () => {
    const { business, servicePackage } = await listedBusiness();
    const days = await publicAvailability(business.slug, servicePackage.id, {
      days: 7,
      now: new Date("2026-08-03T00:00:00Z"),
    });
    expect(days!.some((day) => day.slots.length > 0)).toBe(true);
  });

  it.each([
    BusinessStatus.DRAFT,
    BusinessStatus.PENDING_REVIEW,
    BusinessStatus.SUSPENDED,
  ])("returns nothing for a %s business", async (status) => {
    const { business, servicePackage } = await listedBusiness();
    await prisma.business.update({
      where: { id: business.id },
      data: { status },
    });

    expect(
      await publicAvailability(business.slug, servicePackage.id),
    ).toBeNull();
  });

  it("returns nothing for a hidden package", async () => {
    const { user, business, servicePackage } = await listedBusiness();
    await updatePackage(user.id, business.id, servicePackage.id, {
      ...HOUR_SERVICE,
      active: false,
    });

    expect(
      await publicAvailability(business.slug, servicePackage.id),
    ).toBeNull();
  });

  it("returns nothing for an unknown slug", async () => {
    const { servicePackage } = await listedBusiness();
    expect(
      await publicAvailability("no-such-business", servicePackage.id),
    ).toBeNull();
  });

  it("returns nothing for a package from a different business", async () => {
    const listed = await listedBusiness();
    const other = await listedBusiness();

    expect(
      await publicAvailability(listed.business.slug, other.servicePackage.id),
    ).toBeNull();
  });
});

describe("public storefront", () => {
  it("lists active packages and hides inactive ones", async () => {
    const { user, business } = await makeBusiness();
    await createPackage(user.id, business.id, HOUR_SERVICE);
    await createPackage(user.id, business.id, {
      ...HOUR_SERVICE,
      name: "Secret service",
      active: false,
    });
    await prisma.business.update({
      where: { id: business.id },
      data: { status: BusinessStatus.ACTIVE },
    });

    const storefront = await getPublicStorefront(business.slug);
    expect(storefront!.packages.map((row) => row.name)).toEqual([
      "Drain unclogging",
    ]);
  });

  it("still exposes no internal columns", async () => {
    const { user, business } = await makeBusiness();
    await createPackage(user.id, business.id, HOUR_SERVICE);
    await prisma.business.update({
      where: { id: business.id },
      data: { status: BusinessStatus.ACTIVE },
    });

    const storefront = await getPublicStorefront(business.slug);
    expect(storefront).not.toHaveProperty("id");
    expect(storefront).not.toHaveProperty("status");
    expect(storefront!.packages[0]).not.toHaveProperty("bufferMinutes");
  });
});

describe("storefront readiness", () => {
  it("asks for a bookable service and working hours", async () => {
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
    expect(checks.find((check) => check.key === "packages")!.done).toBe(false);
    expect(checks.find((check) => check.key === "hours")!.done).toBe(false);
  });

  it("counts a published service and saved hours as done", async () => {
    const { user, business } = await makeBusiness();
    await createPackage(user.id, business.id, HOUR_SERVICE);
    await setWeeklyHours(user.id, business.id, WEEKDAY_HOURS);

    const checks = await storefrontReadiness(user.id, business.id);
    expect(checks.find((check) => check.key === "packages")!.done).toBe(true);
    expect(checks.find((check) => check.key === "hours")!.done).toBe(true);
  });

  it("does not count a hidden service", async () => {
    const { user, business } = await makeBusiness();
    await createPackage(user.id, business.id, {
      ...HOUR_SERVICE,
      active: false,
    });

    const checks = await storefrontReadiness(user.id, business.id);
    expect(checks.find((check) => check.key === "packages")!.done).toBe(false);
  });
});
