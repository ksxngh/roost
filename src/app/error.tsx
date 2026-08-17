"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary. Catches render/data errors below the root
 * layout and offers a retry, so a single failing page never shows the user a
 * raw stack trace. The digest is logged for correlation with server logs but
 * never shown.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60svh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        An unexpected error occurred. You can try again, and if it keeps
        happening, please let us know.
      </p>
      <div className="mt-6">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
