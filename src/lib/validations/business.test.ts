import { describe, expect, it } from "vitest";

import {
  SLUG_PATTERN,
  businessSlugSchema,
  createBusinessSchema,
  serviceAreaSchema,
  slugify,
  updateBusinessProfileSchema,
} from "@/lib/validations/business";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Northside Plumbing")).toBe("northside-plumbing");
  });

  it("folds accents instead of dropping the word", () => {
    expect(slugify("Café Cleaning")).toBe("cafe-cleaning");
  });

  it("collapses runs of punctuation into a single hyphen", () => {
    expect(slugify("A & B  --  Roofing!!")).toBe("a-b-roofing");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  ***Elite Electric***  ")).toBe("elite-electric");
  });

  it("never ends with a hyphen after truncation", () => {
    const slug = slugify(`${"a".repeat(59)} plumbing`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("🚿🚿🚿")).toBe("");
  });

  it("always produces output matching the public slug pattern", () => {
    for (const name of [
      "Northside Plumbing",
      "Café Cleaning",
      "A & B -- Roofing!!",
      "24/7 HVAC",
    ]) {
      expect(SLUG_PATTERN.test(slugify(name))).toBe(true);
    }
  });
});

describe("businessSlugSchema", () => {
  it("accepts a normal slug", () => {
    expect(businessSlugSchema.parse("northside-plumbing")).toBe(
      "northside-plumbing",
    );
  });

  it("normalises case and surrounding whitespace", () => {
    expect(businessSlugSchema.parse("  Northside  ".trim())).toBe("northside");
  });

  it.each([
    ["too short", "ab"],
    ["underscores", "north_side"],
    ["leading hyphen", "-northside"],
    ["trailing hyphen", "northside-"],
    ["double hyphen", "north--side"],
    ["spaces", "north side"],
  ])("rejects %s", (_label, value) => {
    expect(businessSlugSchema.safeParse(value).success).toBe(false);
  });

  it.each(["admin", "api", "pro", "settings", "storefront"])(
    "rejects the reserved slug %s",
    (value) => {
      expect(businessSlugSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("createBusinessSchema", () => {
  const valid = {
    name: "Northside Plumbing",
    categoryIds: ["cat-1"],
    serviceAreas: [{ city: "Surrey", region: "bc" }],
  };

  it("uppercases the region and defaults the country", () => {
    const parsed = createBusinessSchema.parse(valid);
    expect(parsed.serviceAreas[0]).toEqual({
      city: "Surrey",
      region: "BC",
      country: "CA",
    });
  });

  it("requires at least one category", () => {
    const result = createBusinessSchema.safeParse({
      ...valid,
      categoryIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("caps categories at ten", () => {
    const result = createBusinessSchema.safeParse({
      ...valid,
      categoryIds: Array.from({ length: 11 }, (_, i) => `cat-${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one service area", () => {
    expect(
      createBusinessSchema.safeParse({ ...valid, serviceAreas: [] }).success,
    ).toBe(false);
  });

  it("caps service areas at twenty-five", () => {
    const result = createBusinessSchema.safeParse({
      ...valid,
      serviceAreas: Array.from({ length: 26 }, (_, i) => ({
        city: `City ${i}`,
        region: "BC",
      })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a one-character name", () => {
    expect(
      createBusinessSchema.safeParse({ ...valid, name: "A" }).success,
    ).toBe(false);
  });
});

describe("updateBusinessProfileSchema", () => {
  it("accepts nulls for every optional field", () => {
    const parsed = updateBusinessProfileSchema.parse({
      name: "Northside Plumbing",
      tagline: null,
      about: null,
      phone: null,
      email: null,
      website: null,
    });
    expect(parsed.website).toBeNull();
  });

  it("accepts common phone punctuation", () => {
    const parsed = updateBusinessProfileSchema.parse({
      name: "Northside Plumbing",
      phone: "+1 (604) 555-0142",
    });
    expect(parsed.phone).toBe("+1 (604) 555-0142");
  });

  it("rejects a phone number containing letters", () => {
    expect(
      updateBusinessProfileSchema.safeParse({
        name: "Northside Plumbing",
        phone: "call-me-maybe",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(
      updateBusinessProfileSchema.safeParse({
        name: "Northside Plumbing",
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it.each([
    "javascript:alert(1)",
    "ftp://example.com",
    "data:text/html;base64,PHNjcmlwdD4=",
  ])("rejects the non-http website %s", (website) => {
    expect(
      updateBusinessProfileSchema.safeParse({
        name: "Northside Plumbing",
        website,
      }).success,
    ).toBe(false);
  });

  it("accepts https websites", () => {
    const parsed = updateBusinessProfileSchema.parse({
      name: "Northside Plumbing",
      website: "https://example.com",
    });
    expect(parsed.website).toBe("https://example.com");
  });
});

describe("serviceAreaSchema", () => {
  it("normalises region and country to uppercase", () => {
    expect(
      serviceAreaSchema.parse({ city: "Surrey", region: "bc", country: "ca" }),
    ).toEqual({ city: "Surrey", region: "BC", country: "CA" });
  });

  it("rejects an empty city", () => {
    expect(
      serviceAreaSchema.safeParse({ city: "   ", region: "BC" }).success,
    ).toBe(false);
  });

  it("rejects a one-letter region", () => {
    expect(
      serviceAreaSchema.safeParse({ city: "Surrey", region: "B" }).success,
    ).toBe(false);
  });
});
