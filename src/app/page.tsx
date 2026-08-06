import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CreditCard,
  ReceiptText,
  Users,
  Wallet,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/lib/site-config";

/** What a homeowner gets. Trust and price certainty are the whole pitch. */
const homeownerPoints = [
  {
    icon: BadgeCheck,
    title: "Verified, insured pros",
    description:
      "Every business is checked for licensing and insurance before it can take a booking.",
  },
  {
    icon: Wallet,
    title: "Upfront prices",
    description:
      "See the real total before you book — no quotes to chase, no surprises at the door.",
  },
  {
    icon: CalendarCheck,
    title: "Real availability",
    description:
      "Pick from slots the business actually has open. Confirmed instantly, no phone tag.",
  },
];

/** What a provider gets. Each line answers "what does this replace?" */
const providerPoints = [
  {
    icon: Users,
    title: "Client CRM",
    description:
      "Every booking builds your client list automatically — history, addresses, and notes in one place.",
  },
  {
    icon: CalendarCheck,
    title: "Scheduling",
    description:
      "Set your hours once. Customers book only what you have open, and double-bookings can't happen.",
  },
  {
    icon: ReceiptText,
    title: "Quotes & invoicing",
    description:
      "Send an estimate, get it approved in a click, and it becomes a scheduled job with payment on file.",
  },
  {
    icon: CreditCard,
    title: "Payments & payouts",
    description:
      "Secure card payments, automatic invoicing, and earnings paid straight to your bank.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <BrandMark />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/pricing">For business</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Homeowner-facing hero: the marketplace is the front door. */}
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pt-20 pb-16 text-center">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Book trusted home services at upfront prices
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-lg text-balance">
            Find verified local pros for cleaning, plumbing, HVAC, landscaping
            and more. See the real price, pick a time that works, and book in
            under a minute.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/browse">
                Find a pro
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">List your business</Link>
            </Button>
          </div>
        </section>

        <section
          aria-labelledby="homeowner-heading"
          className="mx-auto w-full max-w-5xl px-4 pb-24"
        >
          <h2 id="homeowner-heading" className="sr-only">
            Why book on {siteConfig.name}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {homeownerPoints.map((point) => (
              <li key={point.title}>
                <Card className="h-full">
                  <CardHeader>
                    <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                      <point.icon className="size-5" aria-hidden />
                    </div>
                    <CardTitle>{point.title}</CardTitle>
                    <CardDescription>{point.description}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* Provider-facing band: visually distinct so it reads as the other
            side of the marketplace, not more homeowner copy. */}
        <section
          aria-labelledby="business-heading"
          className="bg-muted/40 border-y"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-20">
            <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
              {siteConfig.name} for business
            </p>
            <h2
              id="business-heading"
              className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              Win local customers and run the work behind them
            </h2>
            <p className="text-muted-foreground mt-4 max-w-2xl text-balance">
              {siteConfig.businessDescription} No lead fees, no scattered tools
              — and customers who arrive already booked.
            </p>

            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {providerPoints.map((point) => (
                <li key={point.title}>
                  <Card className="h-full">
                    <CardHeader>
                      <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                        <point.icon className="size-5" aria-hidden />
                      </div>
                      <CardTitle>{point.title}</CardTitle>
                      <CardDescription>{point.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  Join as a provider
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {new Date().getFullYear()} {siteConfig.name}
        </span>
        <span>{siteConfig.description}</span>
      </footer>
    </div>
  );
}
