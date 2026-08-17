import { afterEach, describe, expect, it, vi } from "vitest";

import { businessNav, settingsNav, siteConfig } from "@/lib/site-config";

describe("siteConfig", () => {
  it("has a name and description for metadata", () => {
    expect(siteConfig.name.length).toBeGreaterThan(0);
    expect(siteConfig.description.length).toBeGreaterThan(0);
  });

  it("has a valid URL", () => {
    expect(() => new URL(siteConfig.url)).not.toThrow();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is an empty string", async () => {
    // Regression: Next.js inlines an *unset* NEXT_PUBLIC_ var as "" at build
    // time, not undefined, which broke `??`. `new URL("")` throws, so this
    // failed the whole build (see CHANGELOG). `||` must be used instead.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.resetModules();
    const { siteConfig: reloaded } = await import("@/lib/site-config");
    expect(reloaded.url).toBe("http://localhost:3000");
    expect(() => new URL(reloaded.url)).not.toThrow();
  });

  it("uses a real value of NEXT_PUBLIC_APP_URL when one is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://roost.example.com");
    vi.resetModules();
    const { siteConfig: reloaded } = await import("@/lib/site-config");
    expect(reloaded.url).toBe("https://roost.example.com");
  });
});

describe("navigation", () => {
  const allItems = [...businessNav, ...settingsNav];

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
