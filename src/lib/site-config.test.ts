import { describe, expect, it } from "vitest";

import { appNav, settingsNav, siteConfig } from "@/lib/site-config";

describe("siteConfig", () => {
  it("has a name and description for metadata", () => {
    expect(siteConfig.name.length).toBeGreaterThan(0);
    expect(siteConfig.description.length).toBeGreaterThan(0);
  });

  it("has a valid URL", () => {
    expect(() => new URL(siteConfig.url)).not.toThrow();
  });
});

describe("navigation", () => {
  const allItems = [...appNav, ...settingsNav];

  it("contains no duplicate hrefs", () => {
    const hrefs = allItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps each href consistent with its active segment", () => {
    for (const item of allItems) {
      expect(item.href).toBe(`/${item.segment}`);
    }
  });

  it("gives every item a title and an icon", () => {
    for (const item of allItems) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.icon).toBeTypeOf("object");
    }
  });
});
