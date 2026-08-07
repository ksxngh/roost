/**
 * Subscription plans.
 *
 * The single source of truth for what a plan costs and what it includes.
 * Marketing pages, the eventual billing integration, and seat enforcement all
 * read from here so a price can never be advertised in one place and charged
 * in another.
 *
 * Prices are integer cents, like every other amount in the system.
 *
 * ── Positioning ──────────────────────────────────────────────────────────
 * Benchmarked against Padpal (padpal.com/pricing, checked 2026-08-04):
 * Pro $144.99 CAD/month, Premium $229.99 CAD/month, 9% marketplace fee.
 * Roost undercuts each tier by $15.00/month and takes 8% rather than 9%.
 * Undercutting the subscription while charging a *higher* take rate would
 * lose the comparison on exactly the jobs worth winning.
 */

export type PlanId = "pro" | "premium";

/** Whether a listed capability actually ships today. */
export type FeatureStatus = "live" | "soon";

export type PlanFeature = {
  label: string;
  /** Present on each plan, and whether it is built yet. */
  pro: FeatureStatus | false;
  premium: FeatureStatus | false;
  /** Text instead of a tick, for things that differ by degree. */
  proText?: string;
  premiumText?: string;
  /** Headline rows, shown first and emphasised. */
  headline?: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  priceCents: number;
  /** What the same tier costs at Padpal, for the comparison line. */
  competitorPriceCents: number;
  currency: "CAD";
  seats: number;
  featured?: boolean;
};

export const PLANS: readonly Plan[] = [
  {
    id: "pro",
    name: "Roost Pro",
    tagline: "Everything a solo operator needs to run the work.",
    priceCents: 12_999,
    competitorPriceCents: 14_499,
    currency: "CAD",
    seats: 1,
  },
  {
    id: "premium",
    name: "Roost Premium",
    tagline: "For teams, with Roost bringing you the work.",
    priceCents: 21_499,
    competitorPriceCents: 22_999,
    currency: "CAD",
    seats: 8,
    featured: true,
  },
] as const;

/**
 * Annual billing: pay for ten months, get twelve.
 *
 * Expressed as a multiplier rather than a second price so the two can never
 * drift apart.
 */
export const ANNUAL_MONTHS_CHARGED = 10;

export function annualPriceCents(plan: Plan): number {
  return plan.priceCents * ANNUAL_MONTHS_CHARGED;
}

export function monthlySavingCents(plan: Plan): number {
  return plan.competitorPriceCents - plan.priceCents;
}

/**
 * The comparison grid.
 *
 * `status` is deliberate: this page must not advertise capability the product
 * does not have. Anything still being built is marked, not implied.
 */
export const PLAN_FEATURES: readonly PlanFeature[] = [
  {
    label: "Guaranteed bookings — Roost advertises you and sends you jobs",
    pro: false,
    premium: "soon",
    headline: true,
  },
  {
    label: "Roost-funded advertising across search and social",
    pro: false,
    premium: "soon",
    headline: true,
  },
  {
    label: "Public storefront on the Roost marketplace",
    pro: "live",
    premium: "live",
  },
  {
    label: "Bookings, scheduling, and job workflow",
    pro: "live",
    premium: "live",
  },
  {
    label: "Card payments, deposits, and automatic refunds",
    pro: "live",
    premium: "live",
  },
  { label: "Quotes and invoicing", pro: "live", premium: "live" },
  { label: "Licence and insurance verification", pro: "live", premium: "live" },
  {
    label: "Calendar, day sheets, and job reminders",
    pro: "live",
    premium: "live",
  },
  { label: "Client list and job history", pro: "live", premium: "live" },
  {
    label: "Team seats",
    pro: "live",
    premium: "live",
    proText: "1 seat (solo)",
    premiumText: "Up to 8 seats",
  },
  { label: "Assign jobs across your team", pro: false, premium: "live" },
  { label: "Invite employees", pro: false, premium: "live" },
  { label: "Granular permissions per teammate", pro: false, premium: "live" },
  {
    label: "Support",
    pro: "live",
    premium: "live",
    proText: "Standard support",
    premiumText: "Dedicated support",
  },
] as const;

/** Roost's cut of a marketplace booking, in basis points. */
export const MARKETPLACE_FEE_BPS = 800;
/** Padpal's, for the comparison. */
export const COMPETITOR_FEE_BPS = 900;

export function planById(id: PlanId): Plan {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/**
 * The database stores the plan as a `PlanTier` enum (`PRO`/`PREMIUM`); the
 * marketing layer keys everything by the lowercase `PlanId`. This bridges
 * the two so seat limits and prices have one source.
 */
export function planTierToId(tier: "PRO" | "PREMIUM"): PlanId {
  return tier === "PRO" ? "pro" : "premium";
}

/** How many seats a plan tier includes. */
export function seatLimit(tier: "PRO" | "PREMIUM"): number {
  return planById(planTierToId(tier)).seats;
}
