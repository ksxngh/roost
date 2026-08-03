import type { BookingModel } from "@/generated/prisma/models";
import { siteConfig } from "@/lib/site-config";
import { formatMinutes, wallTimeAt } from "@/lib/time";
import { formatPrice } from "@/lib/validations/scheduling";
import { type Mailer, createMailer } from "@/server/mailer";
import { prisma } from "@/server/db";

/**
 * "Monday, 3 August 2026 at 9:00 AM" in the business's own timezone.
 *
 * Both sides of a booking must read the same time, and that time is the one
 * the work happens in — not the reader's device.
 */
export function formatBookingTime(booking: {
  startAt: Date;
  timezone: string;
}): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: booking.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(booking.startAt);
  const time = formatMinutes(
    wallTimeAt(booking.startAt, booking.timezone).minutes,
  );
  return `${date} at ${time}`;
}

function priceLine(booking: BookingModel): string {
  if (booking.pricingModel === "QUOTE") return "Quoted after the visit";
  const price = formatPrice(booking.priceCents ?? 0);
  return booking.pricingModel === "HOURLY" ? `${price} per hour` : price;
}

function addressLines(booking: BookingModel): string {
  return [
    booking.addressLine1,
    booking.addressLine2,
    `${booking.city}, ${booking.region} ${booking.postalCode}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Tell the customer their request is in, and the business that work is
 * waiting on them.
 *
 * Sent as one call so a booking can never notify one side and not the other
 * through a caller forgetting.
 */
export async function sendBookingRequested(
  booking: BookingModel,
  deps: { mailer?: Mailer } = {},
): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: booking.businessId },
    select: { name: true, email: true, slug: true },
  });
  if (!business) return;

  const send = deps.mailer ?? createMailer();
  const when = formatBookingTime(booking);
  const bookingUrl = `${siteConfig.url}/booking/${booking.reference}`;

  await send.send({
    to: booking.customerEmail,
    subject: `Booking requested — ${business.name}`,
    text: [
      `Hi ${booking.customerName},`,
      "",
      `Your request has been sent to ${business.name}. They'll confirm shortly.`,
      "",
      `Service:   ${booking.packageName}`,
      `When:      ${when}`,
      `Price:     ${priceLine(booking)}`,
      `Reference: ${booking.reference}`,
      "",
      "Where:",
      addressLines(booking),
      "",
      `Track this booking: ${bookingUrl}`,
      "",
      `— ${siteConfig.name}`,
    ].join("\n"),
  });

  // A business without a contact email simply gets no mail; the booking still
  // appears on its schedule.
  if (!business.email) return;

  await send.send({
    to: business.email,
    subject: `New booking request — ${when}`,
    text: [
      `${booking.customerName} has requested a booking.`,
      "",
      `Service:   ${booking.packageName}`,
      `When:      ${when}`,
      `Price:     ${priceLine(booking)}`,
      `Reference: ${booking.reference}`,
      "",
      "Customer:",
      `  ${booking.customerName}`,
      `  ${booking.customerEmail}`,
      `  ${booking.customerPhone}`,
      "",
      "Where:",
      addressLines(booking),
      ...(booking.notes ? ["", "Notes:", booking.notes] : []),
      "",
      `Respond: ${siteConfig.url}/schedule`,
    ].join("\n"),
  });
}
