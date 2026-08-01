import { describe, expect, it } from "vitest";

import { parseClientEnv, parseServerEnv } from "@/lib/env";

/** Minimal valid server environment for Milestone 2. */
const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/roost",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("parseServerEnv", () => {
  it("accepts a minimal valid configuration and applies defaults", () => {
    const env = parseServerEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.EMAIL_FROM).toBe("noreply@roost.local");
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("accepts a full configuration", () => {
    const env = parseServerEnv({
      ...base,
      NODE_ENV: "production",
      REDIS_URL: "redis://localhost:6379",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      RESEND_API_KEY: "re_123",
      EMAIL_FROM: "hello@roost.app",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.GOOGLE_CLIENT_ID).toBe("client-id");
  });

  it("requires DATABASE_URL", () => {
    const withoutDb = { BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET };
    expect(() => parseServerEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it("rejects a malformed DATABASE_URL with a readable message", () => {
    expect(() =>
      parseServerEnv({ ...base, DATABASE_URL: "not-a-url" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a DATABASE_URL with the wrong scheme", () => {
    expect(() =>
      parseServerEnv({ ...base, DATABASE_URL: "mysql://localhost:3306/db" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a short BETTER_AUTH_SECRET and explains how to fix it", () => {
    expect(() =>
      parseServerEnv({ ...base, BETTER_AUTH_SECRET: "short" }),
    ).toThrow(/openssl rand/);
  });

  it("rejects an unknown NODE_ENV", () => {
    expect(() => parseServerEnv({ ...base, NODE_ENV: "staging" })).toThrow(
      /NODE_ENV/,
    );
  });

  it("ignores unrelated variables in the source", () => {
    const env = parseServerEnv({ ...base, PATH: "/usr/bin", HOME: "/home/u" });
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
