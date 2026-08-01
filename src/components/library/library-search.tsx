"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

/**
 * Title search, reflected in the URL so a filtered view is shareable and
 * survives a refresh. Debounced to avoid a navigation per keystroke.
 */
export function LibrarySearch({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("search", value.trim());
      } else {
        params.delete("search");
      }
      const query = params.toString();
      const next = query ? `${pathname}?${query}` : pathname;
      // Skip the navigation when nothing actually changed (e.g. remount).
      if (
        next !== `${pathname}?${searchParams.toString()}`.replace(/\?$/, "")
      ) {
        router.replace(next, { scroll: false });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, pathname, router, searchParams]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search documents…"
        aria-label="Search documents"
        className="pr-9 pl-9"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
