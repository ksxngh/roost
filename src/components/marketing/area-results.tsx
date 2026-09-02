import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

import type { StorefrontSummary } from "@/server/businesses/public";

/** Deterministic accent colour for a business avatar, keyed off its name. */
const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "");
  return letters.toUpperCase() || "?";
}

/**
 * The pros serving the chosen area, shown inline under the landing hero so a
 * visitor never leaves the page to see who's near them. Businesses have no
 * uploaded photo yet, so each card carries a coloured initial avatar as its
 * picture — a stable stand-in until real logos exist.
 */
export function AreaResults({
  city,
  region,
  results,
}: {
  city: string;
  region: string;
  results: StorefrontSummary[];
}) {
  const place = `${city}, ${region.toUpperCase()}`;

  if (results.length === 0) {
    return (
      <div className="border-border bg-card mx-auto mt-10 w-full max-w-2xl rounded-xl border p-6 text-center">
        <p className="font-medium">No pros serve {place} yet</p>
        <p className="text-muted-foreground mt-1 text-sm">
          We&apos;re still onboarding businesses there.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-2xl text-left">
      <p className="text-muted-foreground mb-3 text-sm">
        {results.length} {results.length === 1 ? "pro" : "pros"} serving {place}
      </p>
      <ul className="space-y-3">
        {results.map((business) => (
          <li key={business.slug}>
            <Link
              href={`/pro/${business.slug}`}
              className="border-border bg-card hover:border-foreground/20 group flex items-center gap-4 rounded-xl border p-4 transition-colors"
            >
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white ${avatarColor(
                  business.name,
                )}`}
                aria-hidden
              >
                {initials(business.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {business.name}
                </span>
                <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {business.categories
                    .slice(0, 2)
                    .map((c) => c.name)
                    .join(" · ") || "Home services"}
                </span>
              </span>
              <ArrowRight
                className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
