"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/validations/scheduling";
import { payInvoiceAction } from "@/server/billing/actions";

/** Sends the customer to Stripe's hosted checkout for what's outstanding. */
export function PayInvoice({
  reference,
  amountCents,
}: {
  reference: string;
  amountCents: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handlePay() {
    setError(null);
    startTransition(async () => {
      const result = await payInvoiceAction(reference);
      if (result.ok) {
        // Stripe Checkout is an external site, so a full navigation.
        window.location.assign(result.data.url);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={handlePay} disabled={pending}>
        {pending ? "Opening…" : `Pay ${formatPrice(amountCents)}`}
      </Button>
      <p className="text-muted-foreground text-xs">
        Paid securely through Stripe. Card details never reach this site.
      </p>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
