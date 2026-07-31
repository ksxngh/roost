import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("resolves conflicting tailwind classes to the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles conditional objects", () => {
    expect(cn({ hidden: false, flex: true }, "gap-2")).toBe("flex gap-2");
  });

  it("returns an empty string for no input", () => {
    expect(cn()).toBe("");
  });
});
