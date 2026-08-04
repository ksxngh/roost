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
  assignBooking,
  cancelBooking,
  completeBooking,
  confirmBooking,
  createBooking,
  declineBooking,
  setInternalNote,
} from "@/server/businesses/bookings";
import { sendBookingRequested } from "@/server/notifications/booking-mail";
import {
  PaymentNotRequiredError,
  createCheckoutForBooking,
  refundBookingPayment,
} from "@/server/payments/checkout";
import { paymentsConfigured } from "@/server/payments/stripe";
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

    // A booking that can be paid for online goes to Stripe next; one that
    // cannot (quote-priced work, or a business without Stripe) is simply
    // confirmed as a request. Checkout failing must not lose the booking —
    // it already exists and the provider can still see it.
    let checkoutUrl: string | null = null;
    if (paymentsConfigured()) {
      try {
        const checkout = await createCheckoutForBooking(booking.id);
        checkoutUrl = checkout.url;
      } catch (error) {
        if (!(error instanceof PaymentNotRequiredError)) {
          console.error("[booking] checkout could not be started:", error);
        }
      }
    }

    return {
      ok: true as const,
      data: { reference: booking.reference, checkoutUrl },
    };
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

/**
 * Refund after a booking is called off.
 *
 * Deliberately after the status change and deliberately non-fatal: the
 * customer must not stay booked because Stripe was briefly unreachable. A
 * refund that fails here is logged and left for `charge.refunded` or a human.
 */
async function refundQuietly(bookingId: string): Promise<void> {
  if (!paymentsConfigured()) return;
  try {
    await refundBookingPayment(bookingId);
  } catch (error) {
    console.error("[booking] refund failed:", error);
  }
}

export async function declineBookingAction(bookingId: string, reason?: string) {
  return providerMutation(async ({ userId, businessId }) => {
    await declineBooking(userId, businessId, bookingId, reason?.trim() || null);
    await refundQuietly(bookingId);
  });
}

export async function cancelBookingAction(bookingId: string, reason?: string) {
  return providerMutation(async ({ userId, businessId }) => {
    await cancelBooking(userId, businessId, bookingId, reason?.trim() || null);
    await refundQuietly(bookingId);
  });
}

export async function completeBookingAction(bookingId: string) {
  return providerMutation(async ({ userId, businessId }) => {
    await completeBooking(userId, businessId, bookingId);
  });
}

export async function assignBookingAction(
  bookingId: string,
  memberId: string | null,
) {
  return providerMutation(async ({ userId, businessId }) => {
    await assignBooking(userId, businessId, bookingId, memberId);
  });
}

export async function setInternalNoteAction(bookingId: string, note: string) {
  if (note.length > 1000) {
    return invalid("Keep internal notes under 1000 characters.");
  }
  return providerMutation(async ({ userId, businessId }) => {
    await setInternalNote(userId, businessId, bookingId, note);
  });
}
