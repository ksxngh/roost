"use client";

import { AlertTriangle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PLANS, planTierToId } from "@/lib/plans";
import { formatPrice } from "@/lib/validations/scheduling";
import {
  openPortalAction,
  startCheckoutAction,
} from "@/server/billing/subscription-actions";

type Tier = "PRO" | "PREMIUM";
type Interval = "monthly" | "annual";

export type BillingView = {
  plan: Tier;
  seatLimit: number;
  memberCount: number;
  overSeatLimit: boolean;
  subscription: {
    tier: Tier;
    status: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

const STATUS_COPY: Record<
  BillingView["subscription"] extends null ? never : string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  ACTIVE: { label: "Active", variant: "default" },
  TRIALING: { label: "Trial", variant: "secondary" },
  PAST_DUE: { label: "Payment due", variant: "destructive" },
  CANCELED: { label: "Cancelled", variant: "secondary" },
  INCOMPLETE: { label: "Incomplete", variant: "secondary" },
};

export function BillingPanel({
  view,
  configured,
  isOwner,
}: {
  view: BillingView;
  /** Whether this deployment can sell subscriptions at all. */
  configured: boolean;
  isOwner: boolean;
}) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [pending, startTransition] = useTransition();

  const activeSub =
    view.subscription &&
    (view.subscription.status === "ACTIVE" ||
      view.subscription.status === "TRIALING" ||
      view.subscription.status === "PAST_DUE")
      ? view.subscription
      : null;

  function go(action: () => Promise<{ ok: boolean; url?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok && result.url) {
        window.location.assign(result.url);
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Your plan
            {activeSub ? (
              <Badge variant={STATUS_COPY[activeSub.status].variant}>
                {STATUS_COPY[activeSub.status].label}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            You&apos;re on the {planTierToId(view.plan) === "pro" ? "Pro" : "Premium"}{" "}
            plan — {view.memberCount} of {view.seatLimit} seats used.
            {!activeSub
              ? " No active subscription; billing is complimentary during launch."
              : activeSub.cancelAtPeriodEnd && activeSub.currentPeriodEnd
                ? ` Cancels on ${activeSub.currentPeriodEnd.slice(0, 10)}.`
                : activeSub.currentPeriodEnd
                  ? ` Renews on ${activeSub.currentPeriodEnd.slice(0, 10)}.`
                  : ""}
          </CardDescription>
        </CardHeader>

        {view.overSeatLimit ? (
          <CardContent>
            <p className="text-destructive flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              Your team has more members than this plan&apos;s seats. Upgrade,
              or remove members, to stay within your plan.
            </p>
          </CardContent>
        ) : null}
      </Card>

      {!configured ? (
        <Card>
          <CardContent className="text-muted-foreground pt-6 text-sm">
            Subscription billing isn&apos;t switched on for this deployment yet.
          </CardContent>
        </Card>
      ) : !isOwner ? (
        <Card>
          <CardContent className="text-muted-foreground pt-6 text-sm">
            Only the business owner can change the subscription.
          </CardContent>
        </Card>
      ) : activeSub ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage subscription</CardTitle>
            <CardDescription>
              Update your card, download invoices, or cancel through Stripe.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button disabled={pending} onClick={() => go(openPortalAction)}>
              Manage billing
            </Button>
            {view.plan !== "PREMIUM" ? (
              <div>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => go(() => startCheckoutAction("PREMIUM", interval))}
                >
                  Upgrade to Premium
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a plan</CardTitle>
            <CardDescription>
              Billed in Canadian dollars. Cancel any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-1 text-sm">
              {(["monthly", "annual"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={interval === option}
                  onClick={() => setInterval(option)}
                  className={
                    interval === option
                      ? "bg-secondary text-secondary-foreground rounded-md px-3 py-1"
                      : "text-muted-foreground hover:text-foreground rounded-md px-3 py-1"
                  }
                >
                  {option === "monthly" ? "Monthly" : "Annual (2 months free)"}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {PLANS.map((plan) => {
                const tier = plan.id === "pro" ? "PRO" : ("PREMIUM" as Tier);
                const amount =
                  interval === "annual"
                    ? plan.priceCents * 10
                    : plan.priceCents;
                return (
                  <div
                    key={plan.id}
                    className="space-y-2 rounded-lg border p-4"
                  >
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-2xl font-semibold tracking-tight">
                      {formatPrice(amount)}
                      <span className="text-muted-foreground ml-1 text-sm font-normal">
                        /{interval === "annual" ? "yr" : "mo"}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {plan.seats === 1 ? "1 seat" : `Up to ${plan.seats} seats`}
                    </p>
                    <Button
                      className="w-full"
                      disabled={pending}
                      onClick={() => go(() => startCheckoutAction(tier, interval))}
                    >
                      Choose {plan.name.replace("Roost ", "")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
