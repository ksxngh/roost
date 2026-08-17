import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("robots", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

  it("allows crawling the public site", () => {
    expect(rules?.allow).toBe("/");
  });

  it("keeps the app, admin, and API out of the index", () => {
    const disallow = rules?.disallow;
    const list = Array.isArray(disallow) ? disallow : [disallow];
    for (const path of ["/api/", "/admin/", "/settings", "/dashboard"]) {
      expect(list).toContain(path);
    }
  });

  it("points at the sitemap", () => {
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
