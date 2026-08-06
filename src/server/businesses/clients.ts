import type { ClientModel } from "@/generated/prisma/models";
import { BookingStatus, InvoiceStatus } from "@/generated/prisma/enums";
import {
  NotFoundError,
  requireEditor,
  requireMembership,
} from "@/server/businesses/access";
import { prisma } from "@/server/db";

/** Everything a document knows about the person it is for. */
export type ClientIdentity = {
  email: string;
  name: string;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
};

/** Email is the identity, so it is normalised in exactly one place. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Find or create the client a document belongs to.
 *
 * Called from booking, quote, and invoice creation rather than exposed as a
 * "new client" button: a client that exists without any work attached to it
 * is a contact list, not a CRM, and would immediately drift from reality.
 *
 * Contact details are refreshed from the newest document — someone who moves
 * house should not have next month's job sent to the old address — but blank
 * fields never overwrite something already known.
 */
export async function linkClient(
  businessId: string,
  identity: ClientIdentity,
): Promise<string | null> {
  const email = normaliseEmail(identity.email);
  if (!email) return null;

  // Normalised here rather than at each call site, so the client record can
  // never disagree with the document it was derived from.
  const fresh = {
    name: identity.name.trim(),
    ...(identity.phone ? { phone: identity.phone.trim() } : {}),
    ...(identity.addressLine1
      ? { addressLine1: identity.addressLine1.trim() }
      : {}),
    ...(identity.addressLine2
      ? { addressLine2: identity.addressLine2.trim() }
      : {}),
    ...(identity.city ? { city: identity.city.trim() } : {}),
    ...(identity.region
      ? { region: identity.region.trim().toUpperCase() }
      : {}),
    ...(identity.postalCode
      ? { postalCode: identity.postalCode.trim().toUpperCase() }
      : {}),
  };

  const client = await prisma.client.upsert({
    where: { businessId_email: { businessId, email } },
    create: { businessId, email, ...fresh },
    // Notes and archive state are the provider's and are never touched by a
    // new document arriving.
    update: fresh,
    select: { id: true },
  });
  return client.id;
}

export type ClientSummary = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  region: string | null;
  archivedAt: Date | null;
  jobCount: number;
  /** Sum of paid invoices, in cents. */
  lifetimeValueCents: number;
  lastJobAt: Date | null;
};

/**
 * The client list.
 *
 * Totals are computed in the database rather than by loading every document:
 * a business with years of history should not pay for that on every page
 * view.
 */
export async function listClients(
  userId: string,
  businessId: string,
  options: { search?: string; includeArchived?: boolean } = {},
): Promise<ClientSummary[]> {
  await requireMembership(userId, businessId);

  const search = options.search?.trim();
  const clients = await prisma.client.findMany({
    where: {
      businessId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      region: true,
      archivedAt: true,
      _count: { select: { bookings: true } },
      bookings: {
        select: { startAt: true },
        orderBy: { startAt: "desc" },
        take: 1,
      },
      invoices: {
        where: { status: InvoiceStatus.PAID },
        select: { totalCents: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return clients.map((client) => ({
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    city: client.city,
    region: client.region,
    archivedAt: client.archivedAt,
    jobCount: client._count.bookings,
    lifetimeValueCents: client.invoices.reduce(
      (total, invoice) => total + invoice.totalCents,
      0,
    ),
    lastJobAt: client.bookings[0]?.startAt ?? null,
  }));
}

/** One client with their whole history. */
export async function getClient(
  userId: string,
  businessId: string,
  clientId: string,
) {
  await requireMembership(userId, businessId);

  // Scoped by businessId, so another business's client reads as missing.
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    include: {
      bookings: {
        orderBy: { startAt: "desc" },
        select: {
          id: true,
          reference: true,
          packageName: true,
          startAt: true,
          status: true,
          timezone: true,
          priceCents: true,
          pricingModel: true,
        },
      },
      quotes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          totalCents: true,
          createdAt: true,
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          reference: true,
          number: true,
          title: true,
          status: true,
          totalCents: true,
          createdAt: true,
        },
      },
    },
  });
  if (!client) throw new NotFoundError("client");
  return client;
}

/**
 * What this client is worth and how reliable they are.
 *
 * Only `PAID` invoices count towards lifetime value. Money that has been
 * billed but not received is not revenue, and a client list that implies
 * otherwise is worse than none.
 */
export function clientStats(client: {
  bookings: { status: BookingStatus }[];
  invoices: { status: InvoiceStatus; totalCents: number }[];
}) {
  const completed = client.bookings.filter(
    (booking) => booking.status === BookingStatus.COMPLETED,
  ).length;
  const cancelled = client.bookings.filter(
    (booking) =>
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.DECLINED,
  ).length;

  const paidCents = client.invoices
    .filter((invoice) => invoice.status === InvoiceStatus.PAID)
    .reduce((total, invoice) => total + invoice.totalCents, 0);
  const outstandingCents = client.invoices
    // Overdue is derived from the due date, not a stored status, so anything
    // still SENT is money outstanding.
    .filter((invoice) => invoice.status === InvoiceStatus.SENT)
    .reduce((total, invoice) => total + invoice.totalCents, 0);

  return {
    totalJobs: client.bookings.length,
    completedJobs: completed,
    cancelledJobs: cancelled,
    paidCents,
    outstandingCents,
  };
}

export async function setClientNotes(
  userId: string,
  businessId: string,
  clientId: string,
  notes: string | null,
): Promise<void> {
  await requireEditor(userId, businessId, "edit a client");
  const { count } = await prisma.client.updateMany({
    where: { id: clientId, businessId },
    data: { notes: notes?.trim() || null },
  });
  if (count === 0) throw new NotFoundError("client");
}

/**
 * Hide a client from the working list.
 *
 * Archiving rather than deleting: the invoices and bookings attached to them
 * are financial records, and a provider tidying their list must not be able
 * to erase what they billed.
 */
export async function setClientArchived(
  userId: string,
  businessId: string,
  clientId: string,
  archived: boolean,
): Promise<void> {
  await requireEditor(userId, businessId, "archive a client");
  const { count } = await prisma.client.updateMany({
    where: { id: clientId, businessId },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) throw new NotFoundError("client");
}

export type { ClientModel };
