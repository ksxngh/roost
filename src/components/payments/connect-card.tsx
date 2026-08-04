"use client";

import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  refreshStripeStatusAction,
  startStripeOnboardingAction,
} from "@/server/payments/actions";

export type ConnectView = {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export function ConnectCard({
  status,
  configured,
  feePercent,
  isOwner,
}: {
  status: ConnectView;
  /** Whether this deployment has Stripe keys at all. */
  configured: boolean;
  feePercent: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const result = await startStripeOnboardingAction();
      if (result.ok) {
        // Stripe onboarding is an external site, so a full navigation.
        window.location.assign(result.data.url);
      } else {
        setError(result.error);
      }
    });
  }

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshStripeStatusAction();
      if (result.ok) {
        toast.success("Status updated.");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const checks = [
    { label: "Details submitted to Stripe", done: status.detailsSubmitted },
    { label: "Can accept payments", done: status.chargesEnabled },
    { label: "Can receive payouts", done: status.payoutsEnabled },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Getting paid
          {status.chargesEnabled ? (
            <Badge>Active</Badge>
          ) : status.connected ? (
            <Badge variant="secondary">Incomplete</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Customers pay by card when they book. Money goes to your Stripe
          account; Roost keeps {feePercent} of each job.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!configured ? (
          <p className="text-muted-foreground text-sm">
            Payments aren&apos;t switched on for this deployment yet. Bookings
            still work — customers arrange payment with you directly.
          </p>
        ) : !status.connected ? (
          <p className="text-muted-foreground text-sm">
            Connect a Stripe account to take card payments at booking. It takes
            a few minutes and needs your business and banking details.
          </p>
        ) : (
          <ul className="space-y-2">
            {checks.map((check) => (
              <li key={check.label} className="flex items-center gap-2 text-sm">
                {check.done ? (
                  <CheckCircle2
                    className="size-4 shrink-0 text-emerald-500"
                    aria-hidden
                  />
                ) : (
                  <Circle
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden
                  />
                )}
                <span
                  className={check.done ? "text-muted-foreground" : undefined}
                >
                  {check.label}
                </span>
              </li>
            ))}
          </ul>
        )}

        {status.connected && !status.chargesEnabled ? (
          <p className="text-muted-foreground text-sm">
            Stripe still needs something from you. Continue onboarding, then
            refresh this page.
          </p>
        ) : null}

        {!isOwner ? (
          <p className="text-muted-foreground text-sm">
            Only the business owner can change payout settings.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>

      {configured && isOwner ? (
        <CardFooter className="gap-2">
          <Button onClick={handleConnect} disabled={pending}>
            <ExternalLink className="size-4" aria-hidden />
            {pending
              ? "Opening Stripe…"
              : status.connected
                ? "Continue on Stripe"
                : "Connect Stripe"}
          </Button>
          {status.connected ? (
            <Button variant="ghost" onClick={handleRefresh} disabled={pending}>
              Refresh status
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
