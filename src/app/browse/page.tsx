import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteFooter } from "@/components/marketing/site-footer";
import { siteConfig } from "@/lib/site-config";
import {
  listAllStorefronts,
  listServiceCategories,
  searchStorefronts,
} from "@/server/businesses/public";

export const metadata: Metadata = {
  title: "Find a pro",
  description: `Browse verified home-service pros on ${siteConfig.name}.`,
};

type SearchParams = Promise<{
  city?: string;
  region?: string;
  category?: string;
}>;

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { city = "", region = "", category = "" } = await searchParams;
  const categories = await listServiceCategories();

  // Both parts of a location are required — a bare city name matches the
  // wrong province often enough to be worse than no result.
  const searched = city.trim() !== "" && region.trim() !== "";
  // With an area chosen, show who serves it; without one, show every listed
  // pro so the marketplace never opens empty.
  const results = searched
    ? await searchStorefronts({
        city: city.trim(),
        region: region.trim(),
        categorySlug: category || undefined,
      })
    : await listAllStorefronts({ categorySlug: category || undefined });

  return (
    <div className="flex min-h-svh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-10">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Find a pro</h1>
          <p className="text-muted-foreground">
            Every business here has had its licence and insurance checked.
          </p>
        </header>

        <Card>
          <CardContent className="pt-6">
            <form method="get" className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1 space-y-2">
                <Label htmlFor="browse-city">City</Label>
                <Input
                  id="browse-city"
                  name="city"
                  defaultValue={city}
                  placeholder="Surrey"
                  maxLength={80}
                />
              </div>
              <div className="w-full space-y-2 sm:w-28">
                <Label htmlFor="browse-region">Province</Label>
                <Input
                  id="browse-region"
                  name="region"
                  defaultValue={region}
                  placeholder="BC"
                  maxLength={3}
                />
              </div>
              <div className="w-full space-y-2 sm:w-56">
                <Label htmlFor="browse-category">Service</Label>
                {/* A plain select keeps this form working without JavaScript. */}
                <select
                  id="browse-category"
                  name="category"
                  defaultValue={category}
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  <option value="">Any service</option>
                  {categories.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit">
                  <Search className="size-4" aria-hidden />
                  Search
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {results.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {searched
                  ? `No pros serve ${city.trim()}, ${region.trim().toUpperCase()} yet`
                  : "No businesses listed yet"}
              </CardTitle>
              <CardDescription>
                We&apos;re still onboarding businesses
                {searched ? " in your area" : ""}.{" "}
                <Link href="/signup" className="underline">
                  Run a business here?
                </Link>
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {searched
                ? `Pros serving ${city.trim()}, ${region.trim().toUpperCase()}`
                : "Browsing all pros — pick your area above to narrow it down"}
            </p>
            <ul className="space-y-3">
              {results.map((business) => (
                <li key={business.slug}>
                  <Link href={`/pro/${business.slug}`} className="block">
                    <Card className="hover:border-foreground/20 transition-colors">
                      <CardHeader>
                        <CardTitle className="text-base">
                          {business.name}
                        </CardTitle>
                        {business.tagline ? (
                          <CardDescription>{business.tagline}</CardDescription>
                        ) : null}
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <ul className="flex flex-wrap gap-1.5">
                          {business.categories.slice(0, 5).map((option) => (
                            <li
                              key={option.slug}
                              className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs"
                            >
                              {option.name}
                            </li>
                          ))}
                        </ul>
                        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <MapPin className="size-3.5" aria-hidden />
                          {business.areas
                            .slice(0, 3)
                            .map((area) => `${area.city}, ${area.region}`)
                            .join(" · ")}
                          {business.areas.length > 3
                            ? ` +${business.areas.length - 3} more`
                            : ""}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
