// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { searchAddresses } from "@/server/geo/geocode";
import { normalizeRegion } from "@/server/geo/regions";

afterEach(() => {
  vi.restoreAllMocks();
});

function photonResponse(features: unknown[]) {
  return new Response(JSON.stringify({ features }), { status: 200 });
}

describe("normalizeRegion", () => {
  it("maps a full province name to its code", () => {
    expect(normalizeRegion("Alberta")).toBe("AB");
    expect(normalizeRegion("British Columbia")).toBe("BC");
    expect(normalizeRegion("québec")).toBe("QC");
  });

  it("maps US state names too", () => {
    expect(normalizeRegion("New York")).toBe("NY");
    expect(normalizeRegion("california")).toBe("CA");
  });

  it("passes an existing code through, upper-cased", () => {
    expect(normalizeRegion("bc")).toBe("BC");
    expect(normalizeRegion("ON")).toBe("ON");
  });

  it("leaves an unknown region as trimmed upper-case", () => {
    expect(normalizeRegion(" foobar ")).toBe("FOOBAR");
  });
});

describe("searchAddresses", () => {
  it("skips the request for short queries", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await searchAddresses("12")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes a Photon feature into a suggestion with a region code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      photonResponse([
        {
          geometry: { coordinates: [-115.35, 51.08] },
          properties: {
            osm_id: 42,
            housenumber: "129",
            street: "Carey",
            city: "Canmore",
            state: "Alberta",
            postcode: "T1W 2R3",
            countrycode: "ca",
          },
        },
      ]),
    );

    const [suggestion] = await searchAddresses("129 Carey Canmore");
    expect(suggestion).toMatchObject({
      line1: "129 Carey",
      city: "Canmore",
      region: "AB",
      postalCode: "T1W 2R3",
      country: "CA",
      latitude: 51.08,
      longitude: -115.35,
      label: "129 Carey, Canmore, AB",
    });
  });

  it("drops features with no city or no street line", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      photonResponse([
        { geometry: { coordinates: [0, 0] }, properties: { state: "Alberta" } },
      ]),
    );
    expect(await searchAddresses("nowhere road")).toEqual([]);
  });

  it("filters out addresses in a different country", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      photonResponse([
        {
          geometry: { coordinates: [-73.9, 40.7] },
          properties: {
            housenumber: "1",
            street: "Main St",
            city: "Buffalo",
            state: "New York",
            countrycode: "us",
          },
        },
      ]),
    );
    expect(await searchAddresses("1 Main St", { country: "CA" })).toEqual([]);
  });

  it("returns [] when the geocoder fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    expect(await searchAddresses("anything at all")).toEqual([]);
  });
});
