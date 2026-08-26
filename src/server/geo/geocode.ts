import { normalizeRegion } from "@/server/geo/regions";

/** One picked address, normalized to the shape the booking form stores. */
export type AddressSuggestion = {
  /** A stable id for React keys — the geocoder's OSM id, or a synthesized one. */
  id: string;
  /** Full single-line label for the dropdown, e.g. "129 Carey, Canmore, AB". */
  label: string;
  /** House number + street, for `addressLine1`. */
  line1: string;
  city: string;
  /** Two-letter province/state code. */
  region: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, upper-cased. */
  country: string;
  latitude: number;
  longitude: number;
};

/** A Photon GeoJSON feature — only the properties we read are typed. */
type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    locality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
};

const PHOTON_URL = "https://photon.komoot.io/api";

function labelParts(s: AddressSuggestion): string[] {
  return [s.line1, s.city, s.region].filter(Boolean);
}

/**
 * Turn one Photon feature into a suggestion, or null if it lacks the parts a
 * service address needs (a place with no city or no coordinates is not
 * something a provider can be dispatched to).
 */
function toSuggestion(feature: PhotonFeature): AddressSuggestion | null {
  const p = feature.properties ?? {};
  const coords = feature.geometry?.coordinates;
  if (!coords) return null;

  // Photon uses `city` for towns but falls back to district/locality/county
  // for smaller places — take the first that is present.
  const city = p.city ?? p.district ?? p.locality ?? p.county ?? "";
  if (!city) return null;

  const streetName = p.street ?? p.name ?? "";
  const line1 = [p.housenumber, streetName].filter(Boolean).join(" ").trim();
  if (!line1) return null;

  const suggestion: AddressSuggestion = {
    id: p.osm_id ? String(p.osm_id) : `${coords[0]},${coords[1]}`,
    label: "",
    line1,
    city,
    region: p.state ? normalizeRegion(p.state) : "",
    postalCode: p.postcode ?? "",
    country: (p.countrycode ?? "CA").toUpperCase(),
    longitude: coords[0],
    latitude: coords[1],
  };
  suggestion.label = labelParts(suggestion).join(", ");
  return suggestion;
}

/**
 * Address autocomplete via Photon (OpenStreetMap) — free and keyless, so it
 * works before any paid geocoding provider is set up. Server-side so the
 * provider can be swapped (e.g. for Google Places) without touching the client,
 * and so a slow upstream can be bounded. Returns [] on any failure: a booking
 * must still be completable by typing the address by hand.
 */
export async function searchAddresses(
  query: string,
  options: { limit?: number; country?: string; signal?: AbortSignal } = {},
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(options.limit ?? 5));
  url.searchParams.set("lang", "en");
  url.searchParams.set("layer", "house");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  options.signal?.addEventListener("abort", () => controller.abort());

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { features?: PhotonFeature[] };

    const country = options.country?.toUpperCase();
    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const feature of body.features ?? []) {
      const suggestion = toSuggestion(feature);
      if (!suggestion) continue;
      if (country && suggestion.country !== country) continue;
      // Collapse duplicate labels the geocoder sometimes returns.
      if (seen.has(suggestion.label)) continue;
      seen.add(suggestion.label);
      out.push(suggestion);
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
