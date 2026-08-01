import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Globe, Mail, MapPin, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/lib/site-config";
import { getPublicStorefront } from "@/server/businesses/public";

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
