import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";

import { ClientNotes } from "@/components/clients/client-notes";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NotFoundError } from "@/server/businesses/access";
import { currentMembership } from "@/server/businesses/access";
import { clientStats, getClient } from "@/server/businesses/clients";
import { formatBookingTime } from "@/server/notifications/booking-mail";
import { formatPrice } from "@/lib/validations/scheduling";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Client" };

const BOOKING_BADGE = {
  PENDING: "secondary",
  CONFIRMED: "default",
  COMPLETED: "outline",
  DECLINED: "destructive",
  CANCELLED: "destructive",
} as const;

const DOC_BADGE = {
  DRAFT: "secondary",
  SENT: "default",
  ACCEPTED: "default",
  DECLINED: "destructive",
  EXPIRED: "secondary",
  PAID: "default",
  VOID: "secondary",
} as const;

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireSession();
  const membership = await currentMembership(user.id);
  if (!membership) redirect("/onboarding");

  const { id } = await params;

  let client;
  try {
    client = await getClient(user.id, membership.businessId, id);
  } catch (error) {
    // Another business's client reads as missing rather than forbidden, so a
    // stranger cannot confirm an id exists.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const stats = clientStats(client);
  const address = [
    client.addressLine1,
    client.addressLine2,
    [client.city, client.region].filter(Boolean).join(", "),
    client.postalCode,
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/clients"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All clients
      </Link>

      <PageHeader
        title={client.name}
        description={
          client.archivedAt
            ? "Archived — hidden from your working list."
            : "Built from their bookings, quotes, and invoices."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Mail
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />
              <a href={`mailto:${client.email}`} className="hover:underline">
                {client.email}
              </a>
            </p>
            {client.phone ? (
              <p className="flex items-center gap-2">
                <Phone
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <a
                  href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}
                  className="hover:underline"
                >
                  {client.phone}
                </a>
              </p>
            ) : null}
            {address.length > 0 ? (
              <p className="flex items-start gap-2">
                <MapPin
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <span>{address.join(", ")}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Worth</CardTitle>
            <CardDescription>Paid invoices only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-2xl font-semibold tracking-tight">
              {formatPrice(stats.paidCents)}
            </p>
            {stats.outstandingCents > 0 ? (
              <p className="text-muted-foreground">
                {formatPrice(stats.outstandingCents)} outstanding
              </p>
            ) : null}
            <p className="text-muted-foreground">
              {stats.completedJobs} of {stats.totalJobs} jobs completed
              {stats.cancelledJobs > 0
                ? ` · ${stats.cancelledJobs} called off`
                : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <ClientNotes
        clientId={client.id}
        notes={client.notes}
        archived={client.archivedAt !== null}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Jobs ({client.bookings.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.bookings.length === 0 ? (
            <p className="text-muted-foreground text-sm">No jobs yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {client.bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{booking.packageName}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatBookingTime(booking)}
                    </p>
                  </div>
                  <Badge variant={BOOKING_BADGE[booking.status]}>
                    {booking.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Quotes ({client.quotes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {client.quotes.length === 0 ? (
              <p className="text-muted-foreground text-sm">No quotes yet.</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {client.quotes.map((quote) => (
                  <li
                    key={quote.id}
                    className="flex items-center gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {quote.title}
                    </span>
                    <span className="whitespace-nowrap">
                      {formatPrice(quote.totalCents)}
                    </span>
                    <Badge variant={DOC_BADGE[quote.status]}>
                      {quote.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Invoices ({client.invoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {client.invoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">No invoices yet.</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {client.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex items-center gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="text-muted-foreground font-mono text-xs">
                      #{invoice.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {invoice.title}
                    </span>
                    <span className="whitespace-nowrap">
                      {formatPrice(invoice.totalCents)}
                    </span>
                    <Badge variant={DOC_BADGE[invoice.status]}>
                      {invoice.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
