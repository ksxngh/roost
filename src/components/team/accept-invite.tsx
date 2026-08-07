"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/server/businesses/team-actions";

export function AcceptInvite({
  token,
  emailMatches,
  invitedEmail,
  signedInEmail,
}: {
  token: string;
  emailMatches: boolean;
  invitedEmail: string;
  signedInEmail: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!emailMatches) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive" role="alert">
          This invitation was sent to <strong>{invitedEmail}</strong>, but
          you&apos;re signed in as <strong>{signedInEmail}</strong>.
        </p>
        <p className="text-muted-foreground">
          Sign out and sign back in with the invited address to accept.
        </p>
      </div>
    );
  }

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitationAction(token);
      if (result.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleAccept} disabled={pending} className="w-full">
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
