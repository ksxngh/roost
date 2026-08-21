// @vitest-environment node
/**
 * Integration test for the dashboard stats: the four numbers must count the
 * right rows — confirmed jobs for *today* (in the business's timezone), only
 * sent quotes, only unpaid invoices (net of part-payments), and active clients.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  BookingStatus,
  InvoiceStatus,
  PricingModel,
  QuoteStatus,
} from "@/generated/prisma/enums";
import { dateKeyAt, parseDateKey, wallTimeToInstant } from "@/lib/time";
import { createBusiness } from "@/server/businesses/businesses";
import { getDashboardStats } from "@/server/businesses/dashboard";
import { prisma } from "@/server/db";

let seq = 0;

async function makeBusiness() {
  seq += 1;
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: `Owner ${seq}`,
      email: `owner-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
  const category = await prisma.serviceCategory.create({
    data: {
      slug: `cat-${seq}-${Date.now()}`,
      name: `Cat ${seq}`,
      position: seq,
    },
  });
  const business = await createBusiness(user.id, {
    name: `Biz ${seq}`,
    categoryIds: [category.id],
    serviceAreas: [{ city: "Surrey", region: "BC", country: "CA" }],
  });
  return {
    userId: user.id,
    businessId: business.id,
    timezone: business.timezone,
  };
}

/** An instant at noon today in the given timezone. */
function noonToday(timeZone: string): Date {
  const key = parseDateKey(dateKeyAt(new Date(), timeZone))!;
  return wallTimeToInstant({ ...key, minutes: 12 * 60 }, timeZone)!;
}

async function makeBooking(
  businessId: string,
  status: BookingStatus,
  startAt: Date,
) {
  seq += 1;
  await prisma.booking.create({
    data: {
      reference: `bk-${seq}-${Date.now()}`,
      businessId,
      packageName: "Drain clear",
      pricingModel: PricingModel.FIXED,
      priceCents: 12000,
      durationMinutes: 60,
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60_000),
      timezone: "America/Vancouver",
      status,
      customerName: "Cust",
      customerEmail: `cust-${seq}@example.com`,
      customerPhone: "604-555-0100",
      addressLine1: "1 Main St",
      city: "Surrey",
      region: "BC",
      postalCode: "V3V2J2",
    },
  });
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

describe("getDashboardStats", () => {
  it("counts today's confirmed jobs, open quotes, unpaid invoices, and clients", async () => {
    const { userId, businessId, timezone } = await makeBusiness();
    const today = noonToday(timezone);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60_000);

    // Jobs: one confirmed today (counts), one pending today (excluded — not
    // confirmed), one confirmed yesterday (excluded — not today). Staggered
    // times so the no-overlap constraint is satisfied.
    await makeBooking(businessId, BookingStatus.CONFIRMED, today);
    await makeBooking(
      businessId,
      BookingStatus.PENDING,
      new Date(today.getTime() + 3 * 60 * 60_000),
    );
    await makeBooking(businessId, BookingStatus.CONFIRMED, yesterday);

    // Quotes: one sent (counts), one draft (excluded).
    await prisma.quote.createMany({
      data: [
        {
          reference: `q-${Date.now()}-a`,
          businessId,
          title: "Sent quote",
          customerName: "C",
          customerEmail: "c@example.com",
          status: QuoteStatus.SENT,
        },
        {
          reference: `q-${Date.now()}-b`,
          businessId,
          title: "Draft quote",
          customerName: "C",
          customerEmail: "c@example.com",
          status: QuoteStatus.DRAFT,
        },
      ],
    });

    // Invoices: one sent, part-paid $80 owed (counts); one paid (excluded).
    await prisma.invoice.createMany({
      data: [
        {
          reference: `i-${Date.now()}-a`,
          number: 1,
          businessId,
          title: "Unpaid",
          customerName: "C",
          customerEmail: "c@example.com",
          status: InvoiceStatus.SENT,
          totalCents: 10000,
          amountPaidCents: 2000,
        },
        {
          reference: `i-${Date.now()}-b`,
          number: 2,
          businessId,
          title: "Paid",
          customerName: "C",
          customerEmail: "c@example.com",
          status: InvoiceStatus.PAID,
          totalCents: 5000,
          amountPaidCents: 5000,
        },
      ],
    });

    // Clients: two active, one archived (excluded).
    await prisma.client.createMany({
      data: [
        { businessId, email: "a@example.com", name: "A" },
        { businessId, email: "b@example.com", name: "B" },
        {
          businessId,
          email: "z@example.com",
          name: "Z",
          archivedAt: new Date(),
        },
      ],
    });

    const stats = await getDashboardStats(userId, businessId);

    expect(stats.jobsToday).toBe(1);
    expect(stats.openQuotes).toBe(1);
    expect(stats.unpaidInvoices).toBe(1);
    expect(stats.unpaidCents).toBe(8000);
    expect(stats.clients).toBe(2);
  });

  it("is all zeros for a brand-new business", async () => {
    const { userId, businessId } = await makeBusiness();
    const stats = await getDashboardStats(userId, businessId);
    expect(stats).toMatchObject({
      jobsToday: 0,
      openQuotes: 0,
      unpaidInvoices: 0,
      unpaidCents: 0,
      clients: 0,
    });
  });
});
