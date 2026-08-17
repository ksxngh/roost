"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { moderateAction } from "@/server/admin/verification-actions";

/** The decisions available from each status, and how each button reads. */
type Decision = {
  action: "APPROVE" | "REJECT" | "SUSPEND" | "REINSTATE";
  label: string;
  variant: "default" | "destructive" | "outline";
  /** A reason is required for this decision to be meaningful. */
  requiresNote?: boolean;
};

const DECISIONS: Record<string, Decision[]> = {
  PENDING_REVIEW: [
    { action: "APPROVE", label: "Approve & publish", variant: "default" },
    {
      action: "REJECT",
      label: "Reject",
      variant: "destructive",
      requiresNote: true,
    },
  ],
  ACTIVE: [
    {
      action: "SUSPEND",
      label: "Suspend",
      variant: "destructive",
      requiresNote: true,
    },
  ],
  SUSPENDED: [{ action: "REINSTATE", label: "Reinstate", variant: "default" }],
};

/**
 * The reviewer's action bar. Rendered only for ADMINs — STAFF get the
 * read-only detail with no panel. The available buttons come from the current
 * status, so the UI can only offer transitions the service will accept.
 */
export function DecisionPanel({
  businessId,
  status,
}: {
  businessId: string;
  status: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const decisions = DECISIONS[status] ?? [];
  if (decisions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No actions are available from the current status.
      </p>
    );
  }

  function decide(decision: Decision) {
    if (decision.requiresNote && note.trim().length === 0) {
      toast.error("Add a reason — the business will see it.");
      return;
    }
    startTransition(async () => {
      const result = await moderateAction(businessId, decision.action, note);
      if (result.ok) {
        toast.success("Decision applied.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="review-note">
          Reason{" "}
          <span className="text-muted-foreground font-normal">
            (shown to the business on reject or suspend)
          </span>
        </Label>
        <Textarea
          id="review-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. The insurance certificate has expired — please upload a current one."
          rows={3}
          disabled={pending}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {decisions.map((decision) => (
          <Button
            key={decision.action}
            variant={decision.variant}
            disabled={pending}
            onClick={() => decide(decision)}
          >
            {decision.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
