import { BookingStatus, VerificationStatus } from "@/generated/prisma/enums";
import { siteConfig } from "@/lib/site-config";
import { type Mailer, createMailer } from "@/server/mailer";
import { formatBookingTime } from "@/server/notifications/booking-mail";
import { prisma } from "@/server/db";

/** How far ahead of a job its reminder goes out. */
export const REMINDER_LEAD_HOURS = 24;

/** How long before a licence or certificate lapses we warn the business. */
export const EXPIRY_WARNING_DAYS = 30;

export type SweepResult = {
  considered: number;
  notified: number;
};

/**
 * Remind both sides about tomorrow's work.
 *
 * Idempotent on `reminderSentAt`, and the marker is written **after** the
 * mail is accepted: a crash between the two re-sends a reminder on the next
 * sweep, which is the harmless failure. Writing the marker first would make
 * a crash silently swallow the reminder instead.
 *
 * Only `CONFIRMED` bookings are reminded — nobody should be told to expect a
 * visit that the business has not agreed to.
 */
export async function sweepBookingReminders(
  options: { now?: Date; mailer?: Mailer } = {},
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const mailer = options.mailer ?? createMailer();
  const horizon = new Date(now.getTime() + REMINDER_LEAD_HOURS * 3_600_000);

  const due = await prisma.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      reminderSentAt: null,
      startAt: { gt: now, lte: horizon },
    },
    include: {
      business: { select: { name: true, email: true, phone: true } },
      assignedTo: {
        select: { user: { select: { name: true, email: true } } },
      },
    },
    // A backlog after downtime is drained oldest-first rather than all at
    // once, so one slow sweep cannot stall behind thousands of rows.
    orderBy: { startAt: "asc" },
    take: 200,
  });

  let notified = 0;

  for (const booking of due) {
    const when = formatBookingTime(booking);
    const address = [
      booking.addressLine1,
      booking.addressLine2,
      `${booking.city}, ${booking.region} ${booking.postalCode}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await mailer.send({
        to: booking.customerEmail,
        subject: `Tomorrow: ${booking.packageName} with ${booking.business.name}`,
        text: [
          `Hi ${booking.customerName},`,
          "",
          `A reminder that ${booking.business.name} is booked to visit you.`,
          "",
          `Service:   ${booking.packageName}`,
          `When:      ${when}`,
          `Reference: ${booking.reference}`,
          "",
          "Where:",
          address,
          ...(booking.business.phone
            ? ["", `Need to change something? Call ${booking.business.phone}.`]
            : []),
          "",
          `${siteConfig.url}/booking/${booking.reference}`,
        ].join("\n"),
      });

      // The provider's copy goes to whoever is actually doing the work when
      // the job is assigned, and to the business inbox otherwise.
      const providerEmail =
        booking.assignedTo?.user.email ?? booking.business.email;
      if (providerEmail) {
        await mailer.send({
          to: providerEmail,
          subject: `Tomorrow: ${booking.packageName} for ${booking.customerName}`,
          text: [
            `When:     ${when}`,
            `Customer: ${booking.customerName} · ${booking.customerPhone}`,
            "",
            "Where:",
            address,
            ...(booking.notes ? ["", "Customer notes:", booking.notes] : []),
            ...(booking.internalNote
              ? ["", "Internal note:", booking.internalNote]
              : []),
            "",
            `${siteConfig.url}/schedule`,
          ].join("\n"),
        });
      }

      await prisma.booking.update({
        where: { id: booking.id },
        data: { reminderSentAt: new Date() },
      });
      notified += 1;
    } catch (error) {
      // One bad address must not stop the rest of the sweep.
      console.error(`[sweep] reminder failed for ${booking.reference}:`, error);
    }
  }

  return { considered: due.length, notified };
}

/**
 * Warn a business before its licence or insurance lapses.
 *
 * An expired certificate is the thing that should take a storefront down, so
 * the warning has to arrive with enough time to renew.
 */
export async function sweepDocumentExpiry(
  options: { now?: Date; mailer?: Mailer } = {},
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const mailer = options.mailer ?? createMailer();
  const horizon = new Date(
    now.getTime() + EXPIRY_WARNING_DAYS * 24 * 3_600_000,
  );

  const expiring = await prisma.businessDocument.findMany({
    where: {
      status: VerificationStatus.APPROVED,
      expiryNoticeSentAt: null,
      expiresAt: { not: null, lte: horizon },
    },
    include: { business: { select: { name: true, email: true } } },
    orderBy: { expiresAt: "asc" },
    take: 200,
  });

  let notified = 0;

  for (const document of expiring) {
    if (!document.business.email) {
      // Nothing to send to, but mark it so the sweep does not re-examine
      // this row every day forever.
      await prisma.businessDocument.update({
        where: { id: document.id },
        data: { expiryNoticeSentAt: new Date() },
      });
      continue;
    }

    const expires = document.expiresAt!;
    const days = Math.ceil(
      (expires.getTime() - now.getTime()) / (24 * 3_600_000),
    );
    const kind = document.kind === "LICENCE" ? "licence" : "insurance";

    try {
      await mailer.send({
        to: document.business.email,
        subject:
          days <= 0
            ? `Your ${kind} has expired`
            : `Your ${kind} expires in ${days} day${days === 1 ? "" : "s"}`,
        text: [
          `Hi ${document.business.name},`,
          "",
          days <= 0
            ? `The ${kind} on file for your Roost storefront has expired.`
            : `The ${kind} on file for your Roost storefront expires on ${expires.toISOString().slice(0, 10)}.`,
          "",
          "Upload a current copy to stay listed on the marketplace:",
          `${siteConfig.url}/storefront`,
        ].join("\n"),
      });

      await prisma.businessDocument.update({
        where: { id: document.id },
        data: { expiryNoticeSentAt: new Date() },
      });
      notified += 1;
    } catch (error) {
      console.error(`[sweep] expiry notice failed for ${document.id}:`, error);
    }
  }

  return { considered: expiring.length, notified };
}
