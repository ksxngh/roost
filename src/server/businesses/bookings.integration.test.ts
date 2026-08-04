// @vitest-environment node
/**
 * Booking creation and lifecycle.
 *
 * The two properties that matter: a customer can only book a time that is
 * genuinely offered, and two customers can never hold the same slot — the
 * second of which is settled by the database, not by application code.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BookingStatus,
  BusinessRole,
  BusinessStatus,
} from "@/generated/prisma/enums";
import { NotFoundError, ForbiddenError } from "@/server/businesses/access";
import {
  publicAvailability,
  setWeeklyHours,
  updateBookingSettings,
} from "@/server/businesses/availability";
import {
  InvalidTransitionError,
  SlotUnavailableError,
  assignBooking,
  cancelBooking,
  completeBooking,
  confirmBooking,
  createBooking,
  declineBooking,
  getBookingByReference,
  listAssignableMembers,
  listBookings,
  setInternalNote,
} from "@/server/businesses/bookings";
import { createBusiness } from "@/server/businesses/businesses";
import { createPackage } from "@/server/businesses/packages";
import { prisma } from "@/server/db";

const VANCOUVER = "America/Vancouver";
/** A Monday, well inside the booking horizon relative to NOW below. */
const NOW = new Date("2026-08-03T00:00:00Z");

let seq = 0;

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `book-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

const SERVICE = {
  name: "Drain unclogging",
  description: null,
  categoryId: null,
  pricingModel: "FIXED" as const,
  priceCents: 12_000,
  durationMinutes: 60,
  bufferMinutes: 0,
  active: true,
};

/** An ACTIVE business open Mon–Fri 9–5 with one bookable service. */
async function listedBusiness(name = "Northside Plumbing") {
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
  await setWeeklyHours(
    user.id,
    business.id,
    [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    })),
  );
  await updateBookingSettings(user.id, business.id, {
    timezone: VANCOUVER,
    bookingLeadHours: 0,
    bookingHorizonDays: 30,
  });
  const servicePackage = await createPackage(user.id, business.id, SERVICE);
  await prisma.business.update({
    where: { id: business.id },
    data: { status: BusinessStatus.ACTIVE },
  });
  return { user, business, servicePackage };
}

/** The first instant the marketplace actually offers. */
async function firstSlot(slug: string, packageId: string): Promise<Date> {
  const days = await publicAvailability(slug, packageId, { now: NOW });
  const day = days!.find((entry) => entry.slots.length > 0);
  return day!.slots[0]!;
}

const CUSTOMER = {
  customerName: "Dana Reyes",
  customerEmail: "Dana@Example.com",
  customerPhone: "604-555-0188",
  addressLine1: "12 Elm St",
  addressLine2: null,
  city: "Surrey",
  region: "BC",
  postalCode: "v3s 1a1",
  notes: null,
};

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.booking.deleteMany();
  await prisma.business.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();
});

describe("createBooking", () => {
  it("books an offered slot and snapshots the service", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);

    const booking = await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );

    expect(booking.status).toBe(BookingStatus.PENDING);
    expect(booking.packageName).toBe("Drain unclogging");
    expect(booking.priceCents).toBe(12_000);
    expect(booking.durationMinutes).toBe(60);
    expect(booking.timezone).toBe(VANCOUVER);
    expect(booking.endAt.getTime() - booking.startAt.getTime()).toBe(3_600_000);
    expect(booking.reference).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("normalises the email and postal code", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);

    const booking = await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );

    expect(booking.customerEmail).toBe("dana@example.com");
    expect(booking.postalCode).toBe("V3S 1A1");
  });

  it("links the account when the customer is signed in", async () => {
    const { business, servicePackage } = await listedBusiness();
    const account = await makeUser();
    const startAt = await firstSlot(business.slug, servicePackage.id);

    const booking = await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { userId: account.id, now: NOW },
    );

    expect(booking.userId).toBe(account.id);
  });

  it("allows a guest booking with no account", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);

    const booking = await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );

    expect(booking.userId).toBeNull();
  });

  it("gives every booking a distinct reference", async () => {
    const { business, servicePackage } = await listedBusiness();
    const days = await publicAvailability(business.slug, servicePackage.id, {
      now: NOW,
    });
    // Every 4th slot: consecutive grid slots are 15 minutes apart, which a
    // 60-minute service would overlap.
    const slots = days!
      .flatMap((day) => day.slots)
      .filter((_, index) => index % 4 === 0)
      .slice(0, 5);

    const references = new Set<string>();
    for (const slot of slots) {
      const booking = await createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          startAt: slot.toISOString(),
        },
        { now: NOW },
      );
      references.add(booking.reference);
    }
    expect(references.size).toBe(5);
  });
});

describe("createBooking rejects times that are not on offer", () => {
  it("refuses an arbitrary instant outside working hours", async () => {
    const { business, servicePackage } = await listedBusiness();

    await expect(
      createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          // 3am local on a working Monday.
          startAt: "2026-08-03T10:00:00.000Z",
        },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("refuses a time that is not on the slot grid", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);

    await expect(
      createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          // Five minutes past a real slot.
          startAt: new Date(startAt.getTime() + 5 * 60_000).toISOString(),
        },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("refuses a closed day", async () => {
    const { user, business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    await prisma.availabilityException.create({
      data: {
        businessId: business.id,
        date: new Date(
          Date.UTC(
            startAt.getUTCFullYear(),
            startAt.getUTCMonth(),
            startAt.getUTCDate(),
          ),
        ),
      },
    });
    void user;

    await expect(
      createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          startAt: startAt.toISOString(),
        },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("refuses a slot inside the notice period", async () => {
    const { user, business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    await updateBookingSettings(user.id, business.id, {
      timezone: VANCOUVER,
      bookingLeadHours: 24 * 14,
      bookingHorizonDays: 30,
    });

    await expect(
      createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          startAt: startAt.toISOString(),
        },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it.each([
    BusinessStatus.DRAFT,
    BusinessStatus.PENDING_REVIEW,
    BusinessStatus.SUSPENDED,
  ])("refuses to book a %s business", async (status) => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    await prisma.business.update({
      where: { id: business.id },
      data: { status },
    });

    await expect(
      createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          startAt: startAt.toISOString(),
        },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a hidden service", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    await prisma.servicePackage.update({
      where: { id: servicePackage.id },
      data: { active: false },
    });

    await expect(
      createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          startAt: startAt.toISOString(),
        },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a service belonging to another business", async () => {
    const mine = await listedBusiness("Mine Plumbing");
    const theirs = await listedBusiness("Theirs Plumbing");
    const startAt = await firstSlot(mine.business.slug, mine.servicePackage.id);

    await expect(
      createBooking(
        mine.business.slug,
        {
          ...CUSTOMER,
          packageId: theirs.servicePackage.id,
          startAt: startAt.toISOString(),
        },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("double booking", () => {
  it("refuses a second booking for the same slot", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    const input = {
      ...CUSTOMER,
      packageId: servicePackage.id,
      startAt: startAt.toISOString(),
    };

    await createBooking(business.slug, input, { now: NOW });
    await expect(
      createBooking(business.slug, input, { now: NOW }),
    ).rejects.toBeInstanceOf(SlotUnavailableError);

    expect(await prisma.booking.count()).toBe(1);
  });

  it("refuses a booking that merely overlaps an existing one", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);

    await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );

    // 15 minutes later: a distinct slot on the grid, but the hour overlaps.
    await expect(
      createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          startAt: new Date(startAt.getTime() + 15 * 60_000).toISOString(),
        },
        { now: NOW },
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("lets exactly one of many concurrent requests win", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    const input = {
      ...CUSTOMER,
      packageId: servicePackage.id,
      startAt: startAt.toISOString(),
    };

    // All eight read availability before any of them writes, which is exactly
    // the race a read-then-write check cannot survive.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        createBooking(business.slug, input, { now: NOW }),
      ),
    );

    const won = results.filter((result) => result.status === "fulfilled");
    const lost = results.filter((result) => result.status === "rejected");

    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(7);
    for (const result of lost) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(
        SlotUnavailableError,
      );
    }
    expect(await prisma.booking.count()).toBe(1);
  });

  it("frees the slot again once the booking is declined", async () => {
    const { user, business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    const input = {
      ...CUSTOMER,
      packageId: servicePackage.id,
      startAt: startAt.toISOString(),
    };

    const first = await createBooking(business.slug, input, { now: NOW });
    await declineBooking(user.id, business.id, first.id, "Fully booked");

    const second = await createBooking(business.slug, input, { now: NOW });
    expect(second.id).not.toBe(first.id);
  });

  it("keeps the slot blocked while the booking is only pending", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);

    await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );

    const days = await publicAvailability(business.slug, servicePackage.id, {
      now: NOW,
    });
    const stillOffered = days!
      .flatMap((day) => day.slots)
      .some((slot) => slot.getTime() === startAt.getTime());
    expect(stillOffered).toBe(false);
  });

  it("does not block a different business at the same time", async () => {
    const mine = await listedBusiness("Mine Plumbing");
    const theirs = await listedBusiness("Theirs Plumbing");
    const startAt = await firstSlot(mine.business.slug, mine.servicePackage.id);

    await createBooking(
      mine.business.slug,
      {
        ...CUSTOMER,
        packageId: mine.servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );
    const other = await createBooking(
      theirs.business.slug,
      {
        ...CUSTOMER,
        packageId: theirs.servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );

    expect(other.startAt.getTime()).toBe(startAt.getTime());
  });
});

describe("getBookingByReference", () => {
  it("returns the booking and its business", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    const created = await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );

    const found = await getBookingByReference(created.reference);
    expect(found!.business.name).toBe("Northside Plumbing");
    expect(found!.packageName).toBe("Drain unclogging");
  });

  it("returns null for an unknown reference", async () => {
    expect(await getBookingByReference("AAAAAAAA")).toBeNull();
  });

  it("never exposes the other customer fields it does not need", async () => {
    const { business, servicePackage } = await listedBusiness();
    const startAt = await firstSlot(business.slug, servicePackage.id);
    const created = await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );

    const found = await getBookingByReference(created.reference);
    expect(found).not.toHaveProperty("id");
    expect(found).not.toHaveProperty("customerEmail");
    expect(found).not.toHaveProperty("customerPhone");
  });
});

describe("provider lifecycle", () => {
  async function pendingBooking() {
    const listed = await listedBusiness();
    const startAt = await firstSlot(
      listed.business.slug,
      listed.servicePackage.id,
    );
    const booking = await createBooking(
      listed.business.slug,
      {
        ...CUSTOMER,
        packageId: listed.servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );
    return { ...listed, booking };
  }

  it("confirms a pending booking", async () => {
    const { user, business, booking } = await pendingBooking();
    const confirmed = await confirmBooking(user.id, business.id, booking.id);

    expect(confirmed.status).toBe(BookingStatus.CONFIRMED);
    expect(confirmed.respondedAt).not.toBeNull();
  });

  it("records the reason when declining", async () => {
    const { user, business, booking } = await pendingBooking();
    const declined = await declineBooking(
      user.id,
      business.id,
      booking.id,
      "Outside our service area",
    );

    expect(declined.status).toBe(BookingStatus.DECLINED);
    expect(declined.cancellationReason).toBe("Outside our service area");
    expect(declined.cancelledAt).not.toBeNull();
  });

  it("completes a confirmed booking", async () => {
    const { user, business, booking } = await pendingBooking();
    await confirmBooking(user.id, business.id, booking.id);
    const completed = await completeBooking(user.id, business.id, booking.id);

    expect(completed.status).toBe(BookingStatus.COMPLETED);
  });

  it("refuses to complete a booking that was never confirmed", async () => {
    const { user, business, booking } = await pendingBooking();

    await expect(
      completeBooking(user.id, business.id, booking.id),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("refuses to act on an already-cancelled booking", async () => {
    const { user, business, booking } = await pendingBooking();
    await cancelBooking(user.id, business.id, booking.id);

    await expect(
      confirmBooking(user.id, business.id, booking.id),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("refuses to touch another business's booking", async () => {
    const { booking } = await pendingBooking();
    const other = await listedBusiness("Theirs Plumbing");

    await expect(
      confirmBooking(other.user.id, other.business.id, booking.id),
    ).rejects.toBeInstanceOf(NotFoundError);

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stored.status).toBe(BookingStatus.PENDING);
  });

  it("refuses a MEMBER trying to respond", async () => {
    const { business, booking } = await pendingBooking();
    const member = await makeUser();
    await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: member.id,
        role: BusinessRole.MEMBER,
      },
    });

    await expect(
      confirmBooking(member.id, business.id, booking.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("listBookings", () => {
  it("lists this business's bookings in time order", async () => {
    const { user, business, servicePackage } = await listedBusiness();
    const days = await publicAvailability(business.slug, servicePackage.id, {
      now: NOW,
    });
    const slots = days!.flatMap((day) => day.slots);

    // Booked out of order on purpose.
    for (const index of [4, 0, 8]) {
      await createBooking(
        business.slug,
        {
          ...CUSTOMER,
          packageId: servicePackage.id,
          startAt: slots[index]!.toISOString(),
        },
        { now: NOW },
      );
    }

    const listed = await listBookings(user.id, business.id);
    const times = listed.map((booking) => booking.startAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("filters by status", async () => {
    const { user, business, servicePackage } = await listedBusiness();
    const days = await publicAvailability(business.slug, servicePackage.id, {
      now: NOW,
    });
    const slots = days!.flatMap((day) => day.slots);
    const first = await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: slots[0]!.toISOString(),
      },
      { now: NOW },
    );
    await createBooking(
      business.slug,
      {
        ...CUSTOMER,
        packageId: servicePackage.id,
        startAt: slots[4]!.toISOString(),
      },
      { now: NOW },
    );
    await confirmBooking(user.id, business.id, first.id);

    const confirmed = await listBookings(user.id, business.id, {
      statuses: [BookingStatus.CONFIRMED],
    });
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.id).toBe(first.id);
  });

  it("refuses to list another business's bookings", async () => {
    const mine = await listedBusiness("Mine Plumbing");
    const theirs = await listedBusiness("Theirs Plumbing");

    await expect(
      listBookings(mine.user.id, theirs.business.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("assignment", () => {
  async function teamBooking() {
    const listed = await listedBusiness();
    const colleague = await makeUser();
    const seat = await prisma.businessMember.create({
      data: {
        businessId: listed.business.id,
        userId: colleague.id,
        role: BusinessRole.MEMBER,
      },
    });
    const startAt = await firstSlot(
      listed.business.slug,
      listed.servicePackage.id,
    );
    const booking = await createBooking(
      listed.business.slug,
      {
        ...CUSTOMER,
        packageId: listed.servicePackage.id,
        startAt: startAt.toISOString(),
      },
      { now: NOW },
    );
    return { ...listed, seat, booking };
  }

  it("lists the seats work can be given to", async () => {
    const { user, business } = await teamBooking();
    const members = await listAssignableMembers(user.id, business.id);
    expect(members).toHaveLength(2);
  });

  it("assigns a booking to a team member", async () => {
    const { user, business, booking, seat } = await teamBooking();

    await assignBooking(user.id, business.id, booking.id, seat.id);

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stored.assignedToId).toBe(seat.id);
  });

  it("unassigns with null", async () => {
    const { user, business, booking, seat } = await teamBooking();
    await assignBooking(user.id, business.id, booking.id, seat.id);

    await assignBooking(user.id, business.id, booking.id, null);

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stored.assignedToId).toBeNull();
  });

  it("refuses a seat from another business", async () => {
    const mine = await teamBooking();
    const theirs = await teamBooking();

    await expect(
      assignBooking(
        mine.user.id,
        mine.business.id,
        mine.booking.id,
        theirs.seat.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to assign another business's booking", async () => {
    const mine = await teamBooking();
    const theirs = await teamBooking();

    await expect(
      assignBooking(
        mine.user.id,
        mine.business.id,
        theirs.booking.id,
        mine.seat.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses assignment by a MEMBER", async () => {
    const { business, booking, seat } = await teamBooking();
    const member = await prisma.businessMember.findFirstOrThrow({
      where: { businessId: business.id, role: BusinessRole.MEMBER },
      select: { userId: true },
    });

    await expect(
      assignBooking(member.userId, business.id, booking.id, seat.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps the booking when the assigned seat is deleted", async () => {
    const { user, business, booking, seat } = await teamBooking();
    await assignBooking(user.id, business.id, booking.id, seat.id);

    await prisma.businessMember.delete({ where: { id: seat.id } });

    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stored.assignedToId).toBeNull();
  });

  it("stores and clears an internal note", async () => {
    const { user, business, booking } = await teamBooking();

    await setInternalNote(user.id, business.id, booking.id, "  Gate is stiff ");
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))
        .internalNote,
    ).toBe("Gate is stiff");

    await setInternalNote(user.id, business.id, booking.id, "   ");
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))
        .internalNote,
    ).toBeNull();
  });

  it("refuses to annotate another business's booking", async () => {
    const mine = await teamBooking();
    const theirs = await teamBooking();

    await expect(
      setInternalNote(mine.user.id, mine.business.id, theirs.booking.id, "hi"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
