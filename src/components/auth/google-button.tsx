"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 3.9-5.35 3.9a6 6 0 1 1 0-12c1.5 0 2.9.55 3.95 1.45l2.2-2.2A9 9 0 1 0 12 21c4.5 0 8.6-3.3 9.35-7.9z"
      />
    </svg>
  );
}

export function GoogleButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
    // On success the browser navigates away; only errors reach this point.
    if (error) {
      toast.error(error.message ?? "Could not start Google sign-in.");
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={pending}
    >
      <GoogleGlyph />
      {label}
    </Button>
  );
}
