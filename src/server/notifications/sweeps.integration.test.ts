// @vitest-environment node
/**
 * Background sweeps.
 *
 * The failure modes that matter are silence (a reminder that never goes out)
 * and duplication (one that goes out twice). Both are covered, along with the
 * rule that only work the business has actually agreed to gets a reminder.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BookingStatus,
  BusinessRole,
  VerificationStatus,
} from "@/generated/prisma/enums";
import type { MailMessage, Mailer } from "@/server/mailer";
import {
  REMINDER_LEAD_HOURS,
  sweepBookingReminders,
  sweepDocumentExpiry,
} from "@/server/notifications/sweeps";
import { prisma } from "@/server/db";

const NOW = new Date("2026-09-01T12:00:00Z");
const HOUR = 3_600_000;

let seq = 0;

function collector(): { mailer: Mailer; sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    mailer: {
      async send(message) {
        sent.push(message);
      },
    },
  };
}

async function makeUser(name = "Tech") {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name,
      email: `sweep-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeBusiness(email: string | null = "hello@northside.example") {
  seq += 1;
  return prisma.business.create({
    data: {
      slug: `sweep-biz-${Date.now()}-${seq}`,
      name: "Northside Plumbing",
      email,
      phone: "604-555-0142",
      timezone: "America/Vancouver",
    },
  });
}

async function makeBooking(
  businessId: string,
  overrides: Record<string, unknown> = {},
) {
  seq += 1;
  // Default: 12 hours out, inside the 24-hour reminder window.
  const startAt = new Date(NOW.getTime() + 12 * HOUR);
  return prisma.booking.create({
    data: {
      reference: `SWP${String(seq).padStart(5, "0")}`.slice(0, 8),
      businessId,
      packageName: "Drain unclogging",
      pricingModel: "FIXED",
      priceCents: 12_000,
      durationMinutes: 60,
      startAt,
      endAt: new Date(startAt.getTime() + HOUR),
      timezone: "America/Vancouver",
      status: BookingStatus.CONFIRMED,
      customerName: "Dana Reyes",
      customerEmail: "dana@example.com",
      customerPhone: "604-555-0188",
      addressLine1: "12 Elm St",
      city: "Surrey",
      region: "BC",
      postalCode: "V3S 1A1",
      ...overrides,
    },
  });
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.booking.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
});

describe("sweepBookingReminders", () => {
  it("mails both the customer and the business", async () => {
    const business = await makeBusiness();
    await makeBooking(business.id);
    const { mailer, sent } = collector();

    const result = await sweepBookingReminders({ now: NOW, mailer });

    expect(result).toEqual({ considered: 1, notified: 1 });
    expect(sent.map((message) => message.to)).toEqual([
      "dana@example.com",
      "hello@northside.example",
    ]);
  });

  it("gives the customer the time, address, and reference", async () => {
    const business = await makeBusiness();
    const booking = await makeBooking(business.id);
    const { mailer, sent } = collector();

    await sweepBookingReminders({ now: NOW, mailer });

    expect(sent[0]!.text).toContain(booking.reference);
    expect(sent[0]!.text).toContain("12 Elm St");
    expect(sent[0]!.text).toContain("Surrey, BC V3S 1A1");
    // Rendered in the business's timezone: midnight UTC on 2 September is
    // 5pm on 1 September in Vancouver (PDT).
    expect(sent[0]!.text).toContain("Tuesday, September 1, 2026 at 5:00 PM");
  });

  it("gives the provider the customer's phone number", async () => {
    const business = await makeBusiness();
    await makeBooking(business.id);
    const { mailer, sent } = collector();

    await sweepBookingReminders({ now: NOW, mailer });

    expect(sent[1]!.text).toContain("604-555-0188");
  });

  it("marks the booking so a second sweep sends nothing", async () => {
    const business = await makeBusiness();
    await makeBooking(business.id);
    const first = collector();
    const second = collector();

    await sweepBookingReminders({ now: NOW, mailer: first.mailer });
    const result = await sweepBookingReminders({
      now: NOW,
      mailer: second.mailer,
    });

    expect(first.sent).toHaveLength(2);
    expect(second.sent).toHaveLength(0);
    expect(result).toEqual({ considered: 0, notified: 0 });
  });

  it("leaves the marker unset when the mail fails, so it retries", async () => {
    const business = await makeBusiness();
    const booking = await makeBooking(business.id);
    const failing: Mailer = {
      send: vi.fn().mockRejectedValue(new Error("smtp down")),
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sweepBookingReminders({ now: NOW, mailer: failing });

    expect(result).toEqual({ considered: 1, notified: 0 });
    const stored = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(stored.reminderSentAt).toBeNull();
    logged.mockRestore();
  });

  it("keeps sweeping after one booking fails", async () => {
    const business = await makeBusiness();
    await makeBooking(business.id, { customerEmail: "bad@example.com" });
    await makeBooking(business.id, {
      startAt: new Date(NOW.getTime() + 13 * HOUR),
      endAt: new Date(NOW.getTime() + 14 * HOUR),
    });
    const sent: MailMessage[] = [];
    const flaky: Mailer = {
      async send(message) {
        if (message.to === "bad@example.com") throw new Error("bounced");
        sent.push(message);
      },
    };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sweepBookingReminders({ now: NOW, mailer: flaky });

    expect(result.notified).toBe(1);
    expect(sent.length).toBeGreaterThan(0);
    logged.mockRestore();
  });

  it.each([
    BookingStatus.PENDING,
    BookingStatus.DECLINED,
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED,
  ])("does not remind a %s booking", async (status) => {
    const business = await makeBusiness();
    await makeBooking(business.id, { status });
    const { mailer, sent } = collector();

    await sweepBookingReminders({ now: NOW, mailer });

    expect(sent).toHaveLength(0);
  });

  it("ignores work beyond the reminder window", async () => {
    const business = await makeBusiness();
    await makeBooking(business.id, {
      startAt: new Date(NOW.getTime() + (REMINDER_LEAD_HOURS + 2) * HOUR),
      endAt: new Date(NOW.getTime() + (REMINDER_LEAD_HOURS + 3) * HOUR),
    });
    const { mailer, sent } = collector();

    await sweepBookingReminders({ now: NOW, mailer });

    expect(sent).toHaveLength(0);
  });

  it("ignores work that has already started", async () => {
    const business = await makeBusiness();
    await makeBooking(business.id, {
      startAt: new Date(NOW.getTime() - HOUR),
      endAt: new Date(NOW.getTime()),
    });
    const { mailer, sent } = collector();

    await sweepBookingReminders({ now: NOW, mailer });

    expect(sent).toHaveLength(0);
  });

  it("includes a booking exactly on the window boundary", async () => {
    const business = await makeBusiness();
    await makeBooking(business.id, {
      startAt: new Date(NOW.getTime() + REMINDER_LEAD_HOURS * HOUR),
      endAt: new Date(NOW.getTime() + (REMINDER_LEAD_HOURS + 1) * HOUR),
    });
    const { mailer, sent } = collector();

    await sweepBookingReminders({ now: NOW, mailer });

    expect(sent).toHaveLength(2);
  });

  it("mails the assigned technician rather than the business inbox", async () => {
    const business = await makeBusiness();
    const tech = await makeUser("Sam Tech");
    const seat = await prisma.businessMember.create({
      data: {
        businessId: business.id,
        userId: tech.id,
        role: BusinessRole.MEMBER,
      },
    });
    await makeBooking(business.id, { assignedToId: seat.id });
    const { mailer, sent } = collector();

    await sweepBookingReminders({ now: NOW, mailer });

    expect(sent[1]!.to).toBe(tech.email);
  });

  it("passes the internal note to the provider but not the customer", async () => {
    const business = await makeBusiness();
    await makeBooking(business.id, {
      internalNote: "Bring the 50mm auger",
      notes: "Gate code 4417",
    });
    const { mailer, sent } = collector();

    await sweepBookingReminders({ now: NOW, mailer });

    expect(sent[0]!.text).not.toContain("50mm auger");
    expect(sent[1]!.text).toContain("Bring the 50mm auger");
    expect(sent[1]!.text).toContain("Gate code 4417");
  });

  it("still reminds the customer when the business has no email", async () => {
    const business = await makeBusiness(null);
    await makeBooking(business.id);
    const { mailer, sent } = collector();

    const result = await sweepBookingReminders({ now: NOW, mailer });

    expect(sent).toHaveLength(1);
    expect(result.notified).toBe(1);
  });
});

describe("sweepDocumentExpiry", () => {
  async function makeDocument(
    businessId: string,
    overrides: Record<string, unknown> = {},
  ) {
    seq += 1;
    return prisma.businessDocument.create({
      data: {
        businessId,
        kind: "INSURANCE",
        title: "Certificate",
        storageKey: `business/${businessId}/doc-${seq}-${Date.now()}`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        status: VerificationStatus.APPROVED,
        expiresAt: new Date(NOW.getTime() + 10 * 24 * HOUR),
        ...overrides,
      },
    });
  }

  it("warns before a certificate lapses", async () => {
    const business = await makeBusiness();
    await makeDocument(business.id);
    const { mailer, sent } = collector();

    const result = await sweepDocumentExpiry({ now: NOW, mailer });

    expect(result).toEqual({ considered: 1, notified: 1 });
    expect(sent[0]!.subject).toBe("Your insurance expires in 10 days");
    expect(sent[0]!.text).toContain("/storefront");
  });

  it("says so when the document has already expired", async () => {
    const business = await makeBusiness();
    await makeDocument(business.id, {
      expiresAt: new Date(NOW.getTime() - 5 * 24 * HOUR),
    });
    const { mailer, sent } = collector();

    await sweepDocumentExpiry({ now: NOW, mailer });

    expect(sent[0]!.subject).toBe("Your insurance has expired");
  });

  it("names a licence as a licence", async () => {
    const business = await makeBusiness();
    await makeDocument(business.id, { kind: "LICENCE" });
    const { mailer, sent } = collector();

    await sweepDocumentExpiry({ now: NOW, mailer });

    expect(sent[0]!.subject).toContain("licence");
  });

  it("warns only once", async () => {
    const business = await makeBusiness();
    await makeDocument(business.id);
    const first = collector();
    const second = collector();

    await sweepDocumentExpiry({ now: NOW, mailer: first.mailer });
    await sweepDocumentExpiry({ now: NOW, mailer: second.mailer });

    expect(first.sent).toHaveLength(1);
    expect(second.sent).toHaveLength(0);
  });

  it("ignores a document expiring beyond the warning window", async () => {
    const business = await makeBusiness();
    await makeDocument(business.id, {
      expiresAt: new Date(NOW.getTime() + 90 * 24 * HOUR),
    });
    const { mailer, sent } = collector();

    await sweepDocumentExpiry({ now: NOW, mailer });

    expect(sent).toHaveLength(0);
  });

  it("ignores a document with no expiry date", async () => {
    const business = await makeBusiness();
    await makeDocument(business.id, { expiresAt: null });
    const { mailer, sent } = collector();

    await sweepDocumentExpiry({ now: NOW, mailer });

    expect(sent).toHaveLength(0);
  });

  it.each([VerificationStatus.PENDING, VerificationStatus.REJECTED])(
    "ignores a %s document",
    async (status) => {
      const business = await makeBusiness();
      await makeDocument(business.id, { status });
      const { mailer, sent } = collector();

      await sweepDocumentExpiry({ now: NOW, mailer });

      expect(sent).toHaveLength(0);
    },
  );

  it("stops re-examining a business with no email", async () => {
    const business = await makeBusiness(null);
    const document = await makeDocument(business.id);
    const { mailer, sent } = collector();

    await sweepDocumentExpiry({ now: NOW, mailer });

    expect(sent).toHaveLength(0);
    const stored = await prisma.businessDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(stored.expiryNoticeSentAt).not.toBeNull();
  });
});
