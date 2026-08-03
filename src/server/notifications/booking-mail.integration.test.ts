// @vitest-environment node
/**
 * Booking notifications. Both sides must read the same time, in the
 * business's timezone, and the provider's copy must carry what they need to
 * actually show up.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingModel } from "@/generated/prisma/models";
import type { MailMessage, Mailer } from "@/server/mailer";
import {
  formatBookingTime,
  sendBookingRequested,
} from "@/server/notifications/booking-mail";
import { prisma } from "@/server/db";

function collector() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push(message);
    },
  };
  return { mailer, sent };
}

let seq = 0;

async function makeBusiness(email: string | null) {
  seq += 1;
  return prisma.business.create({
    data: {
      slug: `mail-biz-${Date.now()}-${seq}`,
      name: "Northside Plumbing",
      email,
      timezone: "America/Vancouver",
    },
  });
}

async function makeBooking(
  businessId: string,
  overrides: Partial<BookingModel> = {},
): Promise<BookingModel> {
  seq += 1;
  return prisma.booking.create({
    data: {
      reference: `MAIL${String(seq).padStart(4, "0")}`.slice(0, 8),
      businessId,
      packageName: "Drain unclogging",
      pricingModel: "FIXED",
      priceCents: 12_000,
      durationMinutes: 60,
      // 09:00 on Monday 3 August 2026 in Vancouver (PDT, UTC-7).
      startAt: new Date("2026-08-03T16:00:00Z"),
      endAt: new Date("2026-08-03T17:00:00Z"),
      timezone: "America/Vancouver",
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
});

describe("formatBookingTime", () => {
  it("renders the business's wall-clock time, not UTC", () => {
    expect(
      formatBookingTime({
        startAt: new Date("2026-08-03T16:00:00Z"),
        timezone: "America/Vancouver",
      }),
    ).toBe("Monday, August 3, 2026 at 9:00 AM");
  });

  it("renders the same instant differently in another zone", () => {
    expect(
      formatBookingTime({
        startAt: new Date("2026-08-03T16:00:00Z"),
        timezone: "America/Toronto",
      }),
    ).toBe("Monday, August 3, 2026 at 12:00 PM");
  });

  it("uses standard time in winter", () => {
    expect(
      formatBookingTime({
        startAt: new Date("2026-01-05T17:00:00Z"),
        timezone: "America/Vancouver",
      }),
    ).toBe("Monday, January 5, 2026 at 9:00 AM");
  });
});

describe("sendBookingRequested", () => {
  it("mails both the customer and the business", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id);
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    expect(sent.map((message) => message.to)).toEqual([
      "dana@example.com",
      "hello@northside.example",
    ]);
  });

  it("gives the customer the reference and a link", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id);
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    const [customerMail] = sent;
    expect(customerMail!.subject).toContain("Northside Plumbing");
    expect(customerMail!.text).toContain(booking.reference);
    expect(customerMail!.text).toContain(`/booking/${booking.reference}`);
    expect(customerMail!.text).toContain("Monday, August 3, 2026 at 9:00 AM");
  });

  it("does not put the customer's own contact details in their copy", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id);
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    expect(sent[0]!.text).not.toContain("604-555-0188");
  });

  it("gives the business the contact details and address", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id);
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    const providerMail = sent[1]!;
    expect(providerMail.text).toContain("Dana Reyes");
    expect(providerMail.text).toContain("604-555-0188");
    expect(providerMail.text).toContain("12 Elm St");
    expect(providerMail.text).toContain("Surrey, BC V3S 1A1");
  });

  it("includes the customer's notes for the business only", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id, {
      notes: "Gate code 4417",
    });
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    expect(sent[1]!.text).toContain("Gate code 4417");
  });

  it("omits the notes section entirely when there are none", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id);
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    expect(sent[1]!.text).not.toContain("Notes:");
  });

  it("still mails the customer when the business has no email", async () => {
    const business = await makeBusiness(null);
    const booking = await makeBooking(business.id);
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("dana@example.com");
  });

  it("describes quote-priced work without inventing a number", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id, {
      pricingModel: "QUOTE",
      priceCents: null,
    });
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    expect(sent[0]!.text).toContain("Quoted after the visit");
    expect(sent[0]!.text).not.toContain("$0");
  });

  it("marks an hourly rate as per hour", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id, {
      pricingModel: "HOURLY",
      priceCents: 9_500,
    });
    const { mailer, sent } = collector();

    await sendBookingRequested(booking, { mailer });

    expect(sent[0]!.text).toContain("$95 per hour");
  });

  it("does nothing when the business has vanished", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id);
    await prisma.business.delete({ where: { id: business.id } });
    const { mailer, sent } = collector();

    await expect(
      sendBookingRequested(booking, { mailer }),
    ).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it("propagates a transport failure so the caller can log it", async () => {
    const business = await makeBusiness("hello@northside.example");
    const booking = await makeBooking(business.id);
    const failing: Mailer = {
      send: vi.fn().mockRejectedValue(new Error("smtp down")),
    };

    await expect(
      sendBookingRequested(booking, { mailer: failing }),
    ).rejects.toThrow("smtp down");
  });
});
