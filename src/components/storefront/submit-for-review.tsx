"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { submitForReviewAction } from "@/server/businesses/actions";

/**
 * Submitting only moves the business to PENDING_REVIEW — an admin decides
 * whether it goes live, so a provider can never list itself unverified.
 */
export function SubmitForReview({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await submitForReviewAction();
      if (result.ok) {
        toast.success("Submitted — we'll review your documents shortly.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={disabled || pending}>
      {pending ? "Submitting…" : "Submit for review"}
    </Button>
  );
}
