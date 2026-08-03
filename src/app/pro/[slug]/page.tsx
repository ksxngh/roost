import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, Globe, Mail, MapPin, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/lib/site-config";
import { WEEKDAY_NAMES, formatMinutes, wallTimeAt } from "@/lib/time";
import { formatDuration, formatPrice } from "@/lib/validations/scheduling";
import { publicAvailability } from "@/server/businesses/availability";
import { getPublicStorefront } from "@/server/businesses/public";

/** How many days of openings a storefront advertises. */
const PREVIEW_DAYS = 7;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const business = await getPublicStorefront(slug);
  if (!business) return { title: "Not found" };
  return {
    title: business.name,
    description: business.tagline ?? `${business.name} on ${siteConfig.name}.`,
    alternates: { canonical: `/pro/${business.slug}` },
  };
}

export default async function StorefrontPublicPage({ params }: Params) {
  const { slug } = await params;
  const business = await getPublicStorefront(slug);
  // Non-ACTIVE businesses return null, so an unlisted storefront is a 404
  // rather than a page that leaks its existence.
  if (!business) notFound();

  // Advertised against the first published service — enough to answer "can
  // they come this week?" without turning the page into a booking flow.
  const headline = business.packages.at(0);
  const availability = headline
    ? ((await publicAvailability(business.slug, headline.id, {
        days: PREVIEW_DAYS,
      })) ?? [])
    : [];
  const nextAvailable = availability
    .filter((day) => day.slots.length > 0)
    .map((day) => ({
      date: day.date,
      weekday: day.weekday,
      times: day.slots
        .slice(0, 6)
        .map((slot) =>
          formatMinutes(wallTimeAt(slot, business.timezone).minutes),
        ),
    }));

  const contacts = [
    business.phone && {
      icon: Phone,
      label: business.phone,
      href: `tel:${business.phone.replace(/[^\d+]/g, "")}`,
    },
    business.email && {
      icon: Mail,
      label: business.email,
      href: `mailto:${business.email}`,
    },
    business.website && {
      icon: Globe,
      label: business.website.replace(/^https?:\/\//, ""),
      href: business.website,
    },
  ].filter(Boolean) as {
    icon: typeof Phone;
    label: string;
    href: string;
  }[];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {business.name}
          </h1>
          {business.verifiedAt ? (
            <Badge className="gap-1">
              <BadgeCheck className="size-3.5" aria-hidden />
              Verified
            </Badge>
          ) : null}
        </div>
        {business.tagline ? (
          <p className="text-muted-foreground">{business.tagline}</p>
        ) : null}
        <ul className="flex flex-wrap gap-2">
          {business.categories.map(({ category }) => (
            <li
              key={category.slug}
              className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm"
            >
              {category.name}
            </li>
          ))}
        </ul>
      </header>

      {business.about ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {business.about}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {business.packages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Services &amp; prices</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y">
              {business.packages.map((servicePackage) => (
                <li
                  key={servicePackage.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{servicePackage.name}</p>
                    {servicePackage.description ? (
                      <p className="text-muted-foreground text-sm">
                        {servicePackage.description}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <Clock className="size-3.5" aria-hidden />
                      {formatDuration(servicePackage.durationMinutes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <p className="font-medium">
                      {servicePackage.pricingModel === "QUOTE"
                        ? "Quoted on site"
                        : `${formatPrice(servicePackage.priceCents ?? 0)}${
                            servicePackage.pricingModel === "HOURLY"
                              ? " / hr"
                              : ""
                          }`}
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/pro/${business.slug}/book?service=${servicePackage.id}`}
                      >
                        Book
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {nextAvailable.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next available</CardTitle>
            <CardDescription>
              For {headline?.name}. Times shown in{" "}
              {business.timezone.replace(/_/g, " ")}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {nextAvailable.map((day) => (
                <li key={day.date}>
                  <p className="text-sm font-medium">
                    {WEEKDAY_NAMES[day.weekday]}{" "}
                    <span className="text-muted-foreground font-normal">
                      {day.date}
                    </span>
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {day.times.map((time) => (
                      <li key={time}>
                        <Link
                          href={`/pro/${business.slug}/book?service=${headline?.id}`}
                          className="bg-secondary text-secondary-foreground hover:bg-accent block rounded px-2 py-0.5 text-xs transition-colors"
                        >
                          {time}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Areas served</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {business.serviceAreas.map((area) => (
              <li
                key={`${area.city}-${area.region}`}
                className="flex items-center gap-1.5"
              >
                <MapPin
                  className="text-muted-foreground size-3.5"
                  aria-hidden
                />
                {area.city}, {area.region}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {contacts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Get in touch</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {contacts.map((contact) => (
                <li key={contact.href}>
                  <a
                    href={contact.href}
                    className="inline-flex items-center gap-2 hover:underline"
                    // Provider-supplied URL: never let it reach our window.
                    rel="nofollow noopener noreferrer"
                    target={
                      contact.href.startsWith("http") ? "_blank" : undefined
                    }
                  >
                    <contact.icon
                      className="text-muted-foreground size-4"
                      aria-hidden
                    />
                    {contact.label}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-muted-foreground text-sm">
        <Link href="/browse" className="hover:underline">
          Browse more pros on {siteConfig.name}
        </Link>
      </p>
    </main>
  );
}
