import type { Metadata } from "next";
import Link from "next/link";

import { PlanComparison } from "@/components/pricing/plan-comparison";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ANNUAL_MONTHS_CHARGED,
  COMPETITOR_FEE_BPS,
  MARKETPLACE_FEE_BPS,
  PLANS,
  annualPriceCents,
  monthlySavingCents,
} from "@/lib/plans";
import { siteConfig } from "@/lib/site-config";
import { formatPrice } from "@/lib/validations/scheduling";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Run your home-service business on ${siteConfig.name} from ${formatPrice(PLANS[0]!.priceCents)} CAD a month.`,
  alternates: { canonical: "/pricing" },
};

const percent = (bps: number) => `${bps / 100}%`;

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-4 py-12">
      <header className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Pricing that leaves more in the truck
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl">
          One subscription covers the storefront, the bookings, and everything
          behind the work. No setup fee, no contract, cancel any time.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={cn(plan.featured && "border-primary/50")}
          >
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {plan.name}
                {plan.featured ? <Badge>Most popular</Badge> : null}
              </CardTitle>
              <CardDescription>{plan.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-semibold tracking-tight">
                  {formatPrice(plan.priceCents)}
                  <span className="text-muted-foreground ml-1.5 text-sm font-normal">
                    {plan.currency}/month
                  </span>
                </p>
                <p className="text-muted-foreground text-sm">
                  {plan.seats === 1 ? "1 seat" : `Up to ${plan.seats} seats`} ·
                  plus applicable taxes
                </p>
              </div>

              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {formatPrice(monthlySavingCents(plan))}
                {" a month less than Padpal's comparable plan."}
              </p>

              <p className="text-muted-foreground text-sm">
                Or {formatPrice(annualPriceCents(plan))} a year — pay for{" "}
                {ANNUAL_MONTHS_CHARGED} months, get 12.
              </p>

              <Button asChild className="w-full">
                <Link href="/signup">Start with {plan.name}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          What&apos;s in each plan
        </h2>
        <PlanComparison />
        <p className="text-muted-foreground text-sm">
          Features marked <strong>Soon</strong> are being built and are not
          available yet. We list them so you can see where {siteConfig.name} is
          going — you are never charged for something that isn&apos;t working.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          What else you pay
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {percent(MARKETPLACE_FEE_BPS)} on marketplace bookings
              </CardTitle>
              <CardDescription>
                Only on jobs {siteConfig.name} brings you. Work you booked
                yourself and put through {siteConfig.name} costs nothing extra.
                Padpal charges {percent(COMPETITOR_FEE_BPS)}.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Card processing, charged by Stripe
              </CardTitle>
              <CardDescription>
                2.9% + 30¢ CAD per card payment, billed by Stripe rather than
                us. Payouts land in your own Stripe account.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <p className="text-muted-foreground text-center text-xs">
        Prices in Canadian dollars. Padpal&apos;s pricing quoted from
        padpal.com/pricing as published on 4 August 2026 and may change.
      </p>
    </main>
  );
}
