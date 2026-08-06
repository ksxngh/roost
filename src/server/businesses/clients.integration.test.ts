// @vitest-environment node
/**
 * The client CRM.
 *
 * Clients are derived data, so the properties that matter are: the same
 * person across several documents is one client, the same email at two
 * businesses is two independent records, and money only counts once it has
 * actually been received.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  BookingStatus,
  BusinessRole,
  InvoiceStatus,
} from "@/generated/prisma/enums";
import { ForbiddenError, NotFoundError } from "@/server/businesses/access";
import {
  clientStats,
  getClient,
  linkClient,
  listClients,
  normaliseEmail,
  setClientArchived,
  setClientNotes,
} from "@/server/businesses/clients";
import { prisma } from "@/server/db";

let seq = 0;

async function makeUser() {
  seq += 1;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `User ${seq}`,
      email: `crm-${Date.now()}-${seq}@example.com`,
      emailVerified: true,
    },
  });
}

async function makeBusiness() {
  seq += 1;
  const user = await makeUser();
  const business = await prisma.business.create({
    data: {
      slug: `crm-biz-${Date.now()}-${seq}`,
      name: "Northside Plumbing",
      timezone: "America/Vancouver",
      members: { create: { userId: user.id, role: BusinessRole.OWNER } },
    },
  });
  return { userId: user.id, businessId: business.id };
}

const DANA = {
  email: "dana@example.com",
  name: "Dana Reyes",
  phone: "604-555-0188",
  addressLine1: "12 Elm St",
  city: "Surrey",
  region: "BC",
  postalCode: "V3S 1A1",
};

async function makeBooking(
  businessId: string,
  clientId: string | null,
  overrides: Record<string, unknown> = {},
) {
  seq += 1;
  const startAt = new Date(
    `2027-05-${String((seq % 27) + 1).padStart(2, "0")}T17:00:00Z`,
  );
  return prisma.booking.create({
    data: {
      reference: `CRM${String(seq).padStart(5, "0")}`.slice(0, 8),
      businessId,
      clientId,
      packageName: "Drain unclogging",
      pricingModel: "FIXED",
      priceCents: 12_000,
      durationMinutes: 60,
      startAt,
      endAt: new Date(startAt.getTime() + 3_600_000),
      timezone: "America/Vancouver",
      customerName: DANA.name,
      customerEmail: DANA.email,
      customerPhone: DANA.phone,
      addressLine1: DANA.addressLine1,
      city: DANA.city,
      region: DANA.region,
      postalCode: DANA.postalCode,
      ...overrides,
    },
  });
}

async function makeInvoice(
  businessId: string,
  clientId: string | null,
  totalCents: number,
  status: InvoiceStatus,
) {
  seq += 1;
  return prisma.invoice.create({
    data: {
      reference: `INV${String(seq).padStart(5, "0")}`.slice(0, 8),
      businessId,
      clientId,
      number: seq,
      title: "Work done",
      customerName: DANA.name,
      customerEmail: DANA.email,
      status,
      subtotalCents: totalCents,
      taxCents: 0,
      totalCents,
      taxRateBps: 0,
    },
  });
}

beforeAll(() => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.invoice.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.client.deleteMany();
  await prisma.business.deleteMany();
  await prisma.user.deleteMany();
});

describe("normaliseEmail", () => {
  it("lower-cases and trims, because email is the identity", () => {
    expect(normaliseEmail("  Dana@Example.COM ")).toBe("dana@example.com");
  });
});

describe("linkClient", () => {
  it("creates a client the first time and reuses it after", async () => {
    const { businessId } = await makeBusiness();

    const first = await linkClient(businessId, DANA);
    const second = await linkClient(businessId, DANA);

    expect(first).toBe(second);
    expect(await prisma.client.count({ where: { businessId } })).toBe(1);
  });

  it("treats a differently-cased email as the same person", async () => {
    const { businessId } = await makeBusiness();

    const first = await linkClient(businessId, DANA);
    const second = await linkClient(businessId, {
      ...DANA,
      email: "DANA@EXAMPLE.COM",
    });

    expect(second).toBe(first);
  });

  it("keeps two businesses' records of the same person separate", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();

    const a = await linkClient(mine.businessId, DANA);
    const b = await linkClient(theirs.businessId, DANA);

    expect(a).not.toBe(b);
    expect(await prisma.client.count()).toBe(2);
  });

  it("refreshes details from the newest document", async () => {
    const { businessId } = await makeBusiness();
    const clientId = await linkClient(businessId, DANA);

    await linkClient(businessId, {
      ...DANA,
      name: "Dana Reyes-Okonkwo",
      addressLine1: "88 Oak Ave",
      city: "Langley",
    });

    const stored = await prisma.client.findUniqueOrThrow({
      where: { id: clientId! },
    });
    expect(stored.name).toBe("Dana Reyes-Okonkwo");
    expect(stored.addressLine1).toBe("88 Oak Ave");
    expect(stored.city).toBe("Langley");
  });

  it("never blanks a known detail with an empty one", async () => {
    const { businessId } = await makeBusiness();
    const clientId = await linkClient(businessId, DANA);

    // A quote carries no address; that must not erase the one on file.
    await linkClient(businessId, {
      email: DANA.email,
      name: DANA.name,
      phone: null,
      addressLine1: null,
      city: null,
    });

    const stored = await prisma.client.findUniqueOrThrow({
      where: { id: clientId! },
    });
    expect(stored.addressLine1).toBe("12 Elm St");
    expect(stored.phone).toBe("604-555-0188");
  });

  it("leaves the provider's notes and archive state alone", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;
    await setClientNotes(userId, businessId, clientId, "Side gate is stiff");
    await setClientArchived(userId, businessId, clientId, true);

    await linkClient(businessId, { ...DANA, name: "Dana R" });

    const stored = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
    });
    expect(stored.notes).toBe("Side gate is stiff");
    expect(stored.archivedAt).not.toBeNull();
  });

  it("normalises the address the same way the documents do", async () => {
    const { businessId } = await makeBusiness();

    const clientId = await linkClient(businessId, {
      ...DANA,
      region: "bc",
      postalCode: "v3s 1a1",
      addressLine1: "  12 Elm St  ",
    });

    const stored = await prisma.client.findUniqueOrThrow({
      where: { id: clientId! },
    });
    // A booking stores V3S 1A1; the client record must not say v3s 1a1.
    expect(stored.postalCode).toBe("V3S 1A1");
    expect(stored.region).toBe("BC");
    expect(stored.addressLine1).toBe("12 Elm St");
  });

  it("returns null rather than creating a client with no email", async () => {
    const { businessId } = await makeBusiness();

    expect(await linkClient(businessId, { ...DANA, email: "   " })).toBeNull();
    expect(await prisma.client.count()).toBe(0);
  });
});

describe("listClients", () => {
  it("totals only paid invoices towards lifetime value", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;
    await makeInvoice(businessId, clientId, 30_000, InvoiceStatus.PAID);
    await makeInvoice(businessId, clientId, 50_000, InvoiceStatus.SENT);
    await makeInvoice(businessId, clientId, 90_000, InvoiceStatus.DRAFT);

    const [client] = await listClients(userId, businessId);

    expect(client!.lifetimeValueCents).toBe(30_000);
  });

  it("counts jobs and reports the most recent", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;
    await makeBooking(businessId, clientId, {
      startAt: new Date("2027-05-01T17:00:00Z"),
      endAt: new Date("2027-05-01T18:00:00Z"),
    });
    const latest = await makeBooking(businessId, clientId, {
      startAt: new Date("2027-06-01T17:00:00Z"),
      endAt: new Date("2027-06-01T18:00:00Z"),
    });

    const [client] = await listClients(userId, businessId);

    expect(client!.jobCount).toBe(2);
    expect(client!.lastJobAt?.toISOString()).toBe(latest.startAt.toISOString());
  });

  it("hides archived clients unless asked", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;
    await setClientArchived(userId, businessId, clientId, true);

    expect(await listClients(userId, businessId)).toHaveLength(0);
    expect(
      await listClients(userId, businessId, { includeArchived: true }),
    ).toHaveLength(1);
  });

  it.each([
    ["name", "reyes"],
    ["email", "DANA@"],
    ["phone", "555-0188"],
    ["city", "surrey"],
  ])("searches by %s, case-insensitively", async (_field, term) => {
    const { userId, businessId } = await makeBusiness();
    await linkClient(businessId, DANA);

    expect(
      await listClients(userId, businessId, { search: term }),
    ).toHaveLength(1);
  });

  it("returns nothing for a search that matches nobody", async () => {
    const { userId, businessId } = await makeBusiness();
    await linkClient(businessId, DANA);

    expect(
      await listClients(userId, businessId, { search: "nobody" }),
    ).toHaveLength(0);
  });

  it("never shows another business's clients", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();
    await linkClient(theirs.businessId, DANA);

    expect(await listClients(mine.userId, mine.businessId)).toHaveLength(0);
  });

  it("refuses to list a business the caller is not in", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();

    await expect(
      listClients(mine.userId, theirs.businessId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getClient", () => {
  it("returns the whole history", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;
    await makeBooking(businessId, clientId);
    await makeInvoice(businessId, clientId, 12_000, InvoiceStatus.PAID);

    const client = await getClient(userId, businessId, clientId);

    expect(client.bookings).toHaveLength(1);
    expect(client.invoices).toHaveLength(1);
  });

  it("hides another business's client behind not-found", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();
    const clientId = (await linkClient(theirs.businessId, DANA))!;

    await expect(
      getClient(mine.userId, mine.businessId, clientId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("clientStats", () => {
  it("separates received money from money merely billed", () => {
    const stats = clientStats({
      bookings: [],
      invoices: [
        { status: InvoiceStatus.PAID, totalCents: 30_000 },
        { status: InvoiceStatus.SENT, totalCents: 50_000 },
        { status: InvoiceStatus.DRAFT, totalCents: 90_000 },
        { status: InvoiceStatus.VOID, totalCents: 10_000 },
      ],
    });

    expect(stats.paidCents).toBe(30_000);
    expect(stats.outstandingCents).toBe(50_000);
  });

  it("counts completed and called-off work separately", () => {
    const stats = clientStats({
      bookings: [
        { status: BookingStatus.COMPLETED },
        { status: BookingStatus.COMPLETED },
        { status: BookingStatus.CONFIRMED },
        { status: BookingStatus.CANCELLED },
        { status: BookingStatus.DECLINED },
      ],
      invoices: [],
    });

    expect(stats.totalJobs).toBe(5);
    expect(stats.completedJobs).toBe(2);
    expect(stats.cancelledJobs).toBe(2);
  });

  it("is all zeroes for a brand-new client", () => {
    expect(clientStats({ bookings: [], invoices: [] })).toEqual({
      totalJobs: 0,
      completedJobs: 0,
      cancelledJobs: 0,
      paidCents: 0,
      outstandingCents: 0,
    });
  });
});

describe("notes and archiving", () => {
  it("stores a trimmed note and clears a blank one", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;

    await setClientNotes(userId, businessId, clientId, "  Dog in the yard  ");
    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id: clientId } }))
        .notes,
    ).toBe("Dog in the yard");

    await setClientNotes(userId, businessId, clientId, "   ");
    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id: clientId } }))
        .notes,
    ).toBeNull();
  });

  it("restores an archived client", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;

    await setClientArchived(userId, businessId, clientId, true);
    await setClientArchived(userId, businessId, clientId, false);

    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id: clientId } }))
        .archivedAt,
    ).toBeNull();
  });

  it("keeps the history when a client is archived", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;
    await makeInvoice(businessId, clientId, 30_000, InvoiceStatus.PAID);

    await setClientArchived(userId, businessId, clientId, true);

    expect(await prisma.invoice.count({ where: { clientId } })).toBe(1);
  });

  it("refuses a MEMBER, who should not rewrite the client record", async () => {
    const { businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;
    const member = await makeUser();
    await prisma.businessMember.create({
      data: { businessId, userId: member.id, role: BusinessRole.MEMBER },
    });

    await expect(
      setClientNotes(member.id, businessId, clientId, "hi"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses to annotate another business's client", async () => {
    const mine = await makeBusiness();
    const theirs = await makeBusiness();
    const clientId = (await linkClient(theirs.businessId, DANA))!;

    await expect(
      setClientNotes(mine.userId, mine.businessId, clientId, "hi"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("clients build themselves from real documents", () => {
  it("creates one client from a booking, a quote, and an invoice", async () => {
    const { userId, businessId } = await makeBusiness();
    const { createQuote } = await import("@/server/billing/quotes");
    const { createInvoice } = await import("@/server/billing/invoices");

    await createQuote(userId, businessId, {
      title: "Bathroom refit",
      customerName: DANA.name,
      // Deliberately different casing: still the same person.
      customerEmail: "Dana@Example.com",
      customerPhone: DANA.phone,
      taxRateBps: 0,
      depositCents: 0,
      lines: [
        {
          description: "Labour",
          quantityHundredths: 100,
          unitPriceCents: 50_000,
        },
      ],
    });

    await createInvoice(userId, businessId, {
      title: "Bathroom refit",
      customerName: DANA.name,
      customerEmail: DANA.email,
      addressLine1: DANA.addressLine1,
      city: DANA.city,
      region: DANA.region,
      postalCode: DANA.postalCode,
      taxRateBps: 0,
      lines: [
        {
          description: "Labour",
          quantityHundredths: 100,
          unitPriceCents: 50_000,
        },
      ],
    });

    const clients = await listClients(userId, businessId);
    expect(clients).toHaveLength(1);

    const client = await getClient(userId, businessId, clients[0]!.id);
    expect(client.quotes).toHaveLength(1);
    expect(client.invoices).toHaveLength(1);
    // The invoice carried an address the quote did not.
    expect(client.addressLine1).toBe("12 Elm St");
  });

  it("attaches a marketplace booking to the client it created", async () => {
    const { userId, businessId } = await makeBusiness();
    const clientId = (await linkClient(businessId, DANA))!;
    await makeBooking(businessId, clientId);

    const client = await getClient(userId, businessId, clientId);
    expect(client.bookings).toHaveLength(1);
  });
});
