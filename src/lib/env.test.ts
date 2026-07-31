import { describe, expect, it } from "vitest";

import { parseClientEnv, parseServerEnv } from "@/lib/env";

describe("parseServerEnv", () => {
  it("applies defaults when optional variables are absent", () => {
    const env = parseServerEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("accepts a valid configuration", () => {
    const env = parseServerEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/studyforge",
      REDIS_URL: "redis://localhost:6379",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.DATABASE_URL).toContain("postgresql://");
  });

  it("rejects a malformed DATABASE_URL with a readable message", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "not-a-url" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects a DATABASE_URL with the wrong scheme", () => {
    expect(() =>
      parseServerEnv({ DATABASE_URL: "mysql://localhost:3306/db" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => parseServerEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("ignores unrelated variables in the source", () => {
    const env = parseServerEnv({ PATH: "/usr/bin", HOME: "/home/u" });
    expect(env.NODE_ENV).toBe("development");
  });
});

describe("parseClientEnv", () => {
  it("defaults the app URL for local development", () => {
    const env = parseClientEnv({});
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("rejects a malformed app URL", () => {
    expect(() =>
      parseClientEnv({ NEXT_PUBLIC_APP_URL: "localhost:3000" }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
