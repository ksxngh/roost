import {
  BookingStatus,
  InvoiceStatus,
  QuoteStatus,
} from "@/generated/prisma/enums";
import {
  addDays,
  dateKeyAt,
  parseDateKey,
  wallTimeToInstant,
} from "@/lib/time";
import { NotFoundError, requireMembership } from "@/server/businesses/access";
import { prisma } from "@/server/db";

export type DashboardStats = {
  /** Confirmed jobs whose start falls on today, in the business's timezone. */
  jobsToday: number;
  /** Quotes sent and awaiting the customer's answer. */
  openQuotes: number;
  /** Count of issued-but-unpaid invoices. */
  unpaidInvoices: number;
  /** Total still owed across those invoices, in cents. */
  unpaidCents: number;
  /** Active (non-archived) clients. */
  clients: number;
};

/** [start, end) instants bounding "today" in the business's timezone. */
function todayRange(timeZone: string): { start: Date; end: Date } {
  const todayKey = dateKeyAt(new Date(), timeZone);
  const today = parseDateKey(todayKey);
  const tomorrow = parseDateKey(addDays(todayKey, 1));
  // parseDateKey only returns null for malformed keys; dateKeyAt never produces
  // one, so these are non-null in practice.
  const start = wallTimeToInstant({ ...today!, minutes: 0 }, timeZone);
  const end = wallTimeToInstant({ ...tomorrow!, minutes: 0 }, timeZone);
  return { start: start ?? new Date(0), end: end ?? new Date() };
}

/**
 * The four numbers the dashboard shows: what's booked today, what needs a
 * reply, what's owed, and how many clients. One membership check, then the
 * counts run concurrently.
 */
export async function getDashboardStats(
  userId: string,
  businessId: string,
): Promise<DashboardStats> {
  await requireMembership(userId, businessId);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  if (!business) throw new NotFoundError();

  const { start, end } = todayRange(business.timezone);

  const [jobsToday, openQuotes, unpaid, clients] = await Promise.all([
    prisma.booking.count({
      where: {
        businessId,
        status: BookingStatus.CONFIRMED,
        startAt: { gte: start, lt: end },
      },
    }),
    prisma.quote.count({
      where: { businessId, status: QuoteStatus.SENT },
    }),
    prisma.invoice.findMany({
      where: { businessId, status: InvoiceStatus.SENT },
      select: { totalCents: true, amountPaidCents: true },
    }),
    prisma.client.count({ where: { businessId, archivedAt: null } }),
  ]);

  const unpaidCents = unpaid.reduce(
    (sum, invoice) => sum + (invoice.totalCents - invoice.amountPaidCents),
    0,
  );

  return {
    jobsToday,
    openQuotes,
    unpaidInvoices: unpaid.length,
    unpaidCents,
    clients,
  };
}
