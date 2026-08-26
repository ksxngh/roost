"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { AddressSuggestion } from "@/server/geo/geocode";

/**
 * Street-address field with autocomplete.
 *
 * Typing queries the geocode proxy (debounced) and offers matches; picking one
 * fills the street line and hands the rest of the address (city, province,
 * postcode) back to the parent. It stays a plain text input underneath — a
 * customer can ignore the suggestions and type the address by hand, so a
 * geocoder outage never blocks a booking.
 */
export function AddressAutocomplete({
  value,
  onValueChange,
  onSelect,
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  id?: string;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  // Set when the user picks a suggestion, so we don't immediately re-query the
  // text we just filled in.
  const justPicked = useRef(false);
  const listId = useId();

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const query = value.trim();
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      // Nothing worth querying yet — clear any stale list (done here in the
      // async callback, not synchronously in the effect body).
      if (query.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(
          `/api/geocode?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as {
          suggestions?: AddressSuggestion[];
        };
        setSuggestions(body.suggestions ?? []);
        setActive(-1);
        setOpen((body.suggestions ?? []).length > 0);
      } catch {
        // Aborted or offline — leave the field usable for manual entry.
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [value]);

  function pick(suggestion: AddressSuggestion) {
    justPicked.current = true;
    onSelect(suggestion);
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      pick(suggestions[active]!);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          maxLength={160}
          placeholder="Start typing your address…"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {loading ? (
          <Loader2
            className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
            aria-hidden
          />
        ) : null}
      </div>

      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border shadow-md"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                // onMouseDown, not onClick: it fires before the input's blur,
                // so the pick lands instead of the dropdown closing first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(suggestion);
                }}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                  index === active ? "bg-accent" : "hover:bg-accent"
                }`}
              >
                {suggestion.label}
                {suggestion.postalCode ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {suggestion.postalCode}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
