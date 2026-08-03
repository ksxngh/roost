import { randomBytes } from "node:crypto";

import { BookingStatus, BusinessStatus } from "@/generated/prisma/enums";
import type { BookingModel } from "@/generated/prisma/models";
import { dateKeyAt } from "@/lib/time";
import {
  type CreateBookingInput,
  generateReference,
} from "@/lib/validations/booking";
import {
  NotFoundError,
  requireEditor,
  requireMembership,
} from "@/server/businesses/access";
import { publicAvailability } from "@/server/businesses/availability";
import { prisma } from "@/server/db";

/** The customer asked for a time that is no longer on offer. */
export class SlotUnavailableError extends Error {
  constructor() {
    super("That time was just taken. Please pick another.");
    this.name = "SlotUnavailableError";
  }
}

/** The requested transition makes no sense for the booking's current state. */
export class InvalidTransitionError extends Error {
  constructor(from: BookingStatus, to: BookingStatus) {
    super(`A ${from.toLowerCase()} booking cannot become ${to.toLowerCase()}.`);
    this.name = "InvalidTransitionError";
  }
}

/** SQLSTATE for an exclusion-constraint violation. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * Did this insert lose the race for the slot?
 *
 * Prisma has no error code for exclusion constraints, so it reports P2039
 * ("unknown driver error") and buries the real SQLSTATE under
 * `meta.driverAdapterError.cause.code`. Matching on the constraint *name* as
 * well keeps this honest if the nesting changes in a future release: a false
 * negative here would show the customer "something went wrong" instead of
 * "pick another time".
 */
function isExclusionViolation(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    message?: string;
    meta?: {
      driverAdapterError?: {
        message?: string;
        cause?: { code?: string; originalCode?: string };
      };
    };
  };
  const cause = candidate.meta?.driverAdapterError?.cause;
  if (
    candidate.code === EXCLUSION_VIOLATION ||
    cause?.code === EXCLUSION_VIOLATION ||
    cause?.originalCode === EXCLUSION_VIOLATION
  ) {
    return true;
  }
  const message = `${candidate.meta?.driverAdapterError?.message ?? ""} ${
    candidate.message ?? ""
  }`;
  return message.includes("booking_no_overlap");
}

const REFERENCE_ATTEMPTS = 5;

/**
 * Create a booking for a marketplace customer.
 *
 * Two independent guards, because neither alone is enough:
 *
 *  1. The requested instant must be one the availability engine actually
 *     offers. Without this a caller could post any timestamp — 3am, a closed
 *     Sunday, a time inside the notice period — and have it accepted.
 *  2. The database's exclusion constraint decides who wins a race. A
 *     read-then-write check cannot: two requests can both see a free slot
 *     before either inserts.
 */
export async function createBooking(
  slug: string,
  input: CreateBookingInput,
  options: { userId?: string | null; now?: Date } = {},
): Promise<BookingModel> {
  const now = options.now ?? new Date();

  const business = await prisma.business.findFirst({
    where: { slug, status: BusinessStatus.ACTIVE },
    select: { id: true, timezone: true },
  });
  if (!business) throw new NotFoundError();

  const servicePackage = await prisma.servicePackage.findFirst({
    where: { id: input.packageId, businessId: business.id, active: true },
    select: {
      id: true,
      name: true,
      pricingModel: true,
      priceCents: true,
      durationMinutes: true,
    },
  });
  if (!servicePackage) throw new NotFoundError("service");

  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) throw new SlotUnavailableError();

  // Guard 1: is this instant genuinely on offer?
  const days = await publicAvailability(slug, servicePackage.id, { now });
  const requestedDay = dateKeyAt(startAt, business.timezone);
  const offered = days
    ?.find((day) => day.date === requestedDay)
    ?.slots.some((slot) => slot.getTime() === startAt.getTime());
  if (!offered) throw new SlotUnavailableError();

  const endAt = new Date(
    startAt.getTime() + servicePackage.durationMinutes * 60_000,
  );

  const data = {
    businessId: business.id,
    packageId: servicePackage.id,
    packageName: servicePackage.name,
    pricingModel: servicePackage.pricingModel,
    priceCents: servicePackage.priceCents,
    durationMinutes: servicePackage.durationMinutes,
    startAt,
    endAt,
    timezone: business.timezone,
    userId: options.userId ?? null,
    customerName: input.customerName,
    customerEmail: input.customerEmail.toLowerCase(),
    customerPhone: input.customerPhone,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 ?? null,
    city: input.city,
    region: input.region,
    postalCode: input.postalCode.toUpperCase(),
    notes: input.notes ?? null,
  };

  // Guard 2: let the database settle any race, and retry only a reference
  // collision — never an overlap, which means the slot is genuinely gone.
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.booking.create({
        data: { ...data, reference: generateReference(randomBytes) },
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw new SlotUnavailableError();
      if ((error as { code?: string })?.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a booking reference");
}

/** Public lookup: the reference is the customer's proof of ownership. */
export async function getBookingByReference(reference: string) {
  return prisma.booking.findUnique({
    where: { reference },
    select: {
      reference: true,
      packageName: true,
      pricingModel: true,
      priceCents: true,
      durationMinutes: true,
      startAt: true,
      endAt: true,
      timezone: true,
      status: true,
      customerName: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      notes: true,
      cancellationReason: true,
      business: {
        select: { name: true, slug: true, phone: true, email: true },
      },
    },
  });
}

// ── Provider side ────────────────────────────────────────────────────────

export async function listBookings(
  userId: string,
  businessId: string,
  options: { from?: Date; statuses?: BookingStatus[] } = {},
): Promise<BookingModel[]> {
  await requireMembership(userId, businessId);
  return prisma.booking.findMany({
    where: {
      businessId,
      ...(options.from ? { endAt: { gte: options.from } } : {}),
      ...(options.statuses ? { status: { in: options.statuses } } : {}),
    },
    orderBy: { startAt: "asc" },
  });
}

/**
 * Which statuses may follow which.
 *
 * Encoded as data rather than scattered `if`s so the whole lifecycle is
 * readable in one place — and so an illegal transition is impossible to reach
 * by adding a new caller.
 */
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: [
    BookingStatus.CONFIRMED,
    BookingStatus.DECLINED,
    BookingStatus.CANCELLED,
  ],
  CONFIRMED: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  DECLINED: [],
  CANCELLED: [],
  COMPLETED: [],
};

async function transition(
  userId: string,
  businessId: string,
  bookingId: string,
  to: BookingStatus,
  extra: { cancellationReason?: string | null } = {},
): Promise<BookingModel> {
  await requireEditor(userId, businessId, "manage bookings");

  // Scoped by businessId, so another business's booking reads as missing.
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, businessId },
    select: { id: true, status: true },
  });
  if (!booking) throw new NotFoundError("booking");
  if (!ALLOWED_TRANSITIONS[booking.status].includes(to)) {
    throw new InvalidTransitionError(booking.status, to);
  }

  return prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: to,
      respondedAt: new Date(),
      ...(to === BookingStatus.CANCELLED || to === BookingStatus.DECLINED
        ? {
            cancelledAt: new Date(),
            cancellationReason: extra.cancellationReason ?? null,
          }
        : {}),
    },
  });
}

export function confirmBooking(
  userId: string,
  businessId: string,
  bookingId: string,
) {
  return transition(userId, businessId, bookingId, BookingStatus.CONFIRMED);
}

export function declineBooking(
  userId: string,
  businessId: string,
  bookingId: string,
  reason?: string | null,
) {
  return transition(userId, businessId, bookingId, BookingStatus.DECLINED, {
    cancellationReason: reason,
  });
}

export function cancelBooking(
  userId: string,
  businessId: string,
  bookingId: string,
  reason?: string | null,
) {
  return transition(userId, businessId, bookingId, BookingStatus.CANCELLED, {
    cancellationReason: reason,
  });
}

export function completeBooking(
  userId: string,
  businessId: string,
  bookingId: string,
) {
  return transition(userId, businessId, bookingId, BookingStatus.COMPLETED);
}
