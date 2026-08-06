"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { answerQuoteAction } from "@/server/billing/actions";

/**
 * Accept or decline, as the customer.
 *
 * Declining asks for a reason before it commits — a provider who never learns
 * why cannot fix their pricing, and one extra click is a fair trade.
 */
export function QuoteResponse({ reference }: { reference: string }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function answer(choice: "accept" | "decline") {
    setError(null);
    startTransition(async () => {
      const result = await answerQuoteAction(reference, choice, {
        reason: choice === "decline" ? reason.trim() || null : null,
      });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {declining ? (
        <div className="space-y-2">
          <Label htmlFor="decline-reason">
            Anything they should know? (optional)
          </Label>
          <Textarea
            id="decline-reason"
            rows={2}
            maxLength={280}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Price is higher than we expected"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {declining ? (
          <>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => answer("decline")}
            >
              {pending ? "Sending…" : "Confirm decline"}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setDeclining(false)}
            >
              Back
            </Button>
          </>
        ) : (
          <>
            <Button disabled={pending} onClick={() => answer("accept")}>
              {pending ? "Sending…" : "Accept quote"}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDeclining(true)}
            >
              Decline
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
