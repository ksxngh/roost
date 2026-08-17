import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthorizedCron } from "@/server/cron";

const { mockServerEnv } = vi.hoisted(() => ({
  mockServerEnv: vi.fn<() => { CRON_SECRET?: string; NODE_ENV: string }>(),
}));

vi.mock("@/lib/env", () => ({ serverEnv: mockServerEnv }));

function requestWith(auth?: string): Request {
  return new Request("https://example.com/api/cron/x", {
    headers: auth ? { authorization: auth } : {},
  });
}

afterEach(() => vi.clearAllMocks());

describe("isAuthorizedCron", () => {
  it("accepts a matching Bearer token when a secret is set", () => {
    mockServerEnv.mockReturnValue({
      CRON_SECRET: "s3cret",
      NODE_ENV: "production",
    });
    expect(isAuthorizedCron(requestWith("Bearer s3cret"))).toBe(true);
  });

  it("rejects a wrong or missing token when a secret is set", () => {
    mockServerEnv.mockReturnValue({
      CRON_SECRET: "s3cret",
      NODE_ENV: "production",
    });
    expect(isAuthorizedCron(requestWith("Bearer nope"))).toBe(false);
    expect(isAuthorizedCron(requestWith())).toBe(false);
  });

  it("fails closed in production when no secret is configured", () => {
    mockServerEnv.mockReturnValue({
      CRON_SECRET: undefined,
      NODE_ENV: "production",
    });
    expect(isAuthorizedCron(requestWith())).toBe(false);
  });

  it("allows unauthenticated runs in development for local testing", () => {
    mockServerEnv.mockReturnValue({
      CRON_SECRET: undefined,
      NODE_ENV: "development",
    });
    expect(isAuthorizedCron(requestWith())).toBe(true);
  });
});
