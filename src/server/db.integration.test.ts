// @vitest-environment node
/**
 * Database connection invariants.
 *
 * These exist because of a bug that a round-trip test cannot see: with the
 * session timezone left at the server's default, the driver sent a
 * `timestamptz` as naive wall-clock text and Postgres interpreted it in that
 * zone. Reads were distorted by the same amount, so writing a Date and
 * reading it back agreed perfectly — while the instant on disk was off by the
 * server's UTC offset.
 *
 * The only way to catch it is to ask Postgres what it actually stored, in a
 * form that carries no timezone at all.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";

async function epochOf(reference: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ e: number }[]>(
    `select extract(epoch from "startAt")::float8 as e
       from booking where reference = $1`,
    reference,
  );
  return rows[0]!.e;
}

let businessId: string;

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toContain("roost_test");
  await prisma.booking.deleteMany();
  await prisma.business.deleteMany();
  const business = await prisma.business.create({
    data: {
      slug: `tz-${Date.now()}`,
      name: "TZ Probe",
      timezone: "America/Vancouver",
    },
  });
  businessId = business.id;
});

async function bookAt(reference: string, startAt: Date) {
  return prisma.booking.create({
    data: {
      reference,
      businessId,
      packageName: "Probe",
      pricingModel: "FIXED",
      priceCents: 100,
      durationMinutes: 60,
      startAt,
      endAt: new Date(startAt.getTime() + 3_600_000),
      timezone: "UTC",
      customerName: "T",
      customerEmail: "t@example.com",
      customerPhone: "1",
      addressLine1: "1",
      city: "S",
      region: "BC",
      postalCode: "V1",
    },
  });
}

describe("timestamptz storage", () => {
  it("runs its sessions in UTC", async () => {
    const rows = await prisma.$queryRawUnsafe<{ tz: string }[]>(
      `select current_setting('TimeZone') as tz`,
    );
    expect(rows[0]!.tz).toBe("UTC");
  });

  it("stores the instant JavaScript meant, not its local reading", async () => {
    const target = new Date("2027-06-15T17:30:00.000Z");
    await bookAt("TZUTC001", target);

    expect(await epochOf("TZUTC001")).toBe(target.getTime() / 1000);
  });

  it("stores the same instant either side of a daylight-saving change", async () => {
    // January (PST, -08) and July (PDT, -07) in the business's zone. A
    // session-timezone bug distorts these by *different* amounts, which is
    // what makes rows written months apart stop being comparable.
    const winter = new Date("2027-01-15T17:30:00.000Z");
    const summer = new Date("2027-07-15T17:30:00.000Z");
    await bookAt("TZWIN001", winter);
    await bookAt("TZSUM001", summer);

    expect(await epochOf("TZWIN001")).toBe(winter.getTime() / 1000);
    expect(await epochOf("TZSUM001")).toBe(summer.getTime() / 1000);
  });

  it("agrees with Postgres about which of two instants is later", async () => {
    const earlier = new Date("2027-02-01T00:30:00.000Z");
    const later = new Date("2027-02-01T08:30:00.000Z");
    await bookAt("TZORD001", earlier);
    await bookAt("TZORD002", later);

    const rows = await prisma.$queryRawUnsafe<{ reference: string }[]>(
      `select reference from booking
        where reference in ('TZORD001', 'TZORD002')
        order by "startAt" asc`,
    );
    expect(rows.map((row) => row.reference)).toEqual(["TZORD001", "TZORD002"]);
  });

  it("round-trips through Prisma unchanged", async () => {
    const target = new Date("2027-11-07T09:30:00.000Z");
    const created = await bookAt("TZRND001", target);

    const readBack = await prisma.booking.findUniqueOrThrow({
      where: { id: created.id },
      select: { startAt: true },
    });
    expect(readBack.startAt.toISOString()).toBe(target.toISOString());
  });
});
