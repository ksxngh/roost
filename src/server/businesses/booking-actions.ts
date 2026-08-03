"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createBookingSchema } from "@/lib/validations/booking";
import {
  DuplicateSlugError,
  ForbiddenError,
  NotFoundError,
  currentMembership,
} from "@/server/businesses/access";
import {
  InvalidTransitionError,
  SlotUnavailableError,
  cancelBooking,
  completeBooking,
  confirmBooking,
  createBooking,
  declineBooking,
} from "@/server/businesses/bookings";
import { sendBookingRequested } from "@/server/notifications/booking-mail";
import { RATE_LIMITS, checkRateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/session";

type Result<T = void> =
  | ({ ok: true } & (T extends void ? Record<never, never> : { data: T }))
  | { ok: false; error: string };

function invalid(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

/**
 * Best-effort client address for rate limiting.
 *
 * Proxy headers are forgeable, so this only ever *narrows* who shares a
 * bucket — a forged value costs the forger their own quota, and an absent one
 * falls back to a shared bucket rather than no limit at all.
 */
async function clientKey(): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || requestHeaders.get("x-real-ip") || "unknown";
}

/**
 * Public booking submission.
 *
 * Unauthenticated by design — a homeowner should not need an account to hire
 * someone — so it is rate limited per client, and every field is re-validated
 * server-side against what the business actually offers.
 */
export async function createBookingAction(slug: string, input: unknown) {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]!.message);

  const limit = await checkRateLimit({
    key: `booking:${await clientKey()}`,
    ...RATE_LIMITS.booking,
  });
  if (!limit.allowed) {
    return invalid("Too many booking attempts. Please try again shortly.");
  }

  const session = await getSession();

  try {
    const booking = await createBooking(slug, parsed.data, {
      userId: session?.user.id ?? null,
    });
    // The provider's own views must not keep serving a slot that is now gone.
    revalidatePath(`/pro/${slug}`);
    revalidatePath("/schedule");
    revalidatePath("/availability");

    // Mail is a notification, not part of the booking: a mail outage must not
    // lose a confirmed job.
    await sendBookingRequested(booking).catch((error: unknown) => {
      console.error("[booking] notification failed:", error);
    });

    return { ok: true as const, data: { reference: booking.reference } };
  } catch (error) {
    if (
      error instanceof SlotUnavailableError ||
      error instanceof NotFoundError
    ) {
      return invalid(error.message);
    }
    console.error("[booking] create failed:", error);
    return invalid("Could not book that time. Please try again.");
  }
}

/** Provider-side responses. Shares the membership gate with other actions. */
async function providerMutation<T>(
  run: (context: { userId: string; businessId: string }) => Promise<T>,
): Promise<Result<T>> {
  const session = await getSession();
  if (!session) return invalid("Sign in to manage bookings.");

  const membership = await currentMembership(session.user.id);
  if (!membership) return invalid("Set up your business first.");

  try {
    const data = await run({
      userId: session.user.id,
      businessId: membership.businessId,
    });
    revalidatePath("/schedule");
    revalidatePath("/dashboard");
    revalidatePath("/availability");
    return { ok: true, data } as Result<T>;
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ForbiddenError ||
      error instanceof DuplicateSlugError ||
      error instanceof InvalidTransitionError
    ) {
      return invalid(error.message);
    }
    console.error("[booking action] unexpected failure:", error);
    return invalid("Something went wrong. Please try again.");
  }
}

export async function confirmBookingAction(bookingId: string) {
  return providerMutation(async ({ userId, businessId }) => {
    await confirmBooking(userId, businessId, bookingId);
  });
}

export async function declineBookingAction(bookingId: string, reason?: string) {
  return providerMutation(async ({ userId, businessId }) => {
    await declineBooking(userId, businessId, bookingId, reason?.trim() || null);
  });
}

export async function cancelBookingAction(bookingId: string, reason?: string) {
  return providerMutation(async ({ userId, businessId }) => {
    await cancelBooking(userId, businessId, bookingId, reason?.trim() || null);
  });
}

export async function completeBookingAction(bookingId: string) {
  return providerMutation(async ({ userId, businessId }) => {
    await completeBooking(userId, businessId, bookingId);
  });
}
