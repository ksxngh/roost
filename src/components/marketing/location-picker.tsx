"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Area = { city: string; region: string };

/**
 * Compact area chooser for the marketing header. Picking an area filters the
 * results shown on the landing page itself (via the `city`/`region` query
 * params) rather than navigating away — the visitor stays put and the matching
 * pros appear inline. Only areas with real listings are passed in, so every
 * option returns results.
 *
 * Falls back to a plain link when nothing is listed yet, so an empty
 * marketplace still gives somewhere to go rather than an empty dropdown.
 */
export function LocationPicker({
  areas,
  selected = "",
}: {
  areas: Area[];
  /** The currently chosen "City|REGION", so the control reflects the URL. */
  selected?: string;
}) {
  const router = useRouter();

  if (areas.length === 0) {
    return (
      <Link
        href="/browse"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <MapPin className="size-4" aria-hidden />
        Find a pro
      </Link>
    );
  }

  return (
    <label className="relative inline-flex items-center">
      <MapPin
        className="text-muted-foreground pointer-events-none absolute left-2.5 size-4"
        aria-hidden
      />
      <span className="sr-only">Choose your area</span>
      <select
        // Remount when the URL selection changes so the shown value follows it.
        key={selected}
        aria-label="Choose your area"
        defaultValue={selected}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) {
            router.replace("/", { scroll: false });
            return;
          }
          const [city, region] = value.split("|");
          router.replace(
            `/?city=${encodeURIComponent(city!)}&region=${encodeURIComponent(region!)}`,
            { scroll: false },
          );
        }}
        className="border-input bg-background hover:bg-accent focus-visible:ring-ring h-9 rounded-md border py-0 pr-3 pl-8 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <option value="">Your area</option>
        {areas.map((area) => (
          <option
            key={`${area.city}|${area.region}`}
            value={`${area.city}|${area.region}`}
          >
            {area.city}, {area.region}
          </option>
        ))}
      </select>
    </label>
  );
}
