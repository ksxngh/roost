"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DocumentStatus } from "@/generated/prisma/enums";

const POLL_INTERVAL_MS = 2_500;

/**
 * Watch documents that are still being processed and refresh the page when
 * any of them finishes.
 *
 * Polling a tiny status endpoint costs far less than refetching the whole
 * library on a timer, and the refresh only fires on an actual transition —
 * so an idle library makes no requests at all.
 */
export function useProcessingWatcher(
  documents: { id: string; status: DocumentStatus }[],
): void {
  const router = useRouter();
  const inFlightIds = documents
    .filter(
      (document) =>
        document.status === DocumentStatus.PENDING ||
        document.status === DocumentStatus.PROCESSING,
    )
    .map((document) => document.id)
    .sort();

  // Serialize so the effect only re-subscribes when the watched set changes,
  // not on every render that produces an equivalent array.
  const key = inFlightIds.join(",");

  useEffect(() => {
    if (!key) return;

    let cancelled = false;
    const ids = key.split(",");

    async function poll() {
      try {
        const response = await fetch(
          `/api/documents/status?ids=${encodeURIComponent(ids.join(","))}`,
        );
        if (!response.ok || cancelled) return;
        const { statuses } = (await response.json()) as {
          statuses: { id: string; status: DocumentStatus }[];
        };
        const settled = statuses.some(
          (item) =>
            item.status === DocumentStatus.READY ||
            item.status === DocumentStatus.FAILED,
        );
        if (settled && !cancelled) {
          router.refresh();
        }
      } catch {
        // Transient network failures are ignored; the next tick retries.
      }
    }

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // `router` from next/navigation is stable across renders.
  }, [key, router]);
}
