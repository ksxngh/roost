// @vitest-environment node
/**
 * Integration tests: real Better Auth server API against the throwaway
 * roost_test database (schema pushed by src/test/global-setup.ts).
 */
import { APIError } from "better-auth";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PASSWORD_MIN_LENGTH } from "@/lib/validations/auth";

// Console transport mail (verification links) would otherwise spam test output.
vi.spyOn(console, "info").mockImplementation(() => {});

const { auth } = await import("@/server/auth");
const { prisma } = await import("@/server/db");

const PASSWORD = "correct-horse-battery";
let seq = 0;

/** Unique email per test to keep cases independent. */
function nextEmail(): string {
  seq += 1;
  return `user-${Date.now()}-${seq}@example.com`;
}

async function signUp(email: string, password = PASSWORD) {
  return auth.api.signUpEmail({
    body: { name: "Test User", email, password },
  });
}

beforeAll(async () => {
  // Sanity check: never run destructive cleanup against a non-test database.
  expect(process.env.DATABASE_URL).toContain("roost_test");
});

beforeEach(async () => {
  await prisma.user.deleteMany();
});

describe("sign up", () => {
  it("creates a user and returns a session token", async () => {
    const email = nextEmail();
    const result = await signUp(email);

    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe(email);

    const dbUser = await prisma.user.findUnique({ where: { email } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.emailVerified).toBe(false);
  });

  it("never stores the plaintext password", async () => {
    const email = nextEmail();
    await signUp(email);
    const account = await prisma.account.findFirst({
      where: { user: { email } },
    });
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain(PASSWORD);
  });

  it("rejects a duplicate email", async () => {
    const email = nextEmail();
    await signUp(email);
    await expect(signUp(email)).rejects.toThrow(APIError);
  });

  it("rejects a password shorter than the policy", async () => {
    await expect(
      signUp(nextEmail(), "x".repeat(PASSWORD_MIN_LENGTH - 1)),
    ).rejects.toThrow(APIError);
  });
});

describe("sign in", () => {
  it("succeeds with correct credentials", async () => {
    const email = nextEmail();
    await signUp(email);
    const result = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
    });
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe(email);
  });

  it("rejects a wrong password with 401", async () => {
    const email = nextEmail();
    await signUp(email);
    await expect(
      auth.api.signInEmail({ body: { email, password: "wrong-password-1" } }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("rejects an unknown email with 401 (no user enumeration)", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: nextEmail(), password: PASSWORD },
      }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });
});

describe("sessions", () => {
  it("resolves the session from its cookie token", async () => {
    const email = nextEmail();
    await signUp(email);

    const signIn = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    const cookie = signIn.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("better-auth.session_token");

    const withCookie = await auth.api.getSession({
      headers: new Headers({ cookie: cookie.split(";")[0]! }),
    });
    expect(withCookie?.user.email).toBe(email);
  });

  it("returns null for a missing or garbage cookie", async () => {
    const none = await auth.api.getSession({ headers: new Headers() });
    expect(none).toBeNull();

    const garbage = await auth.api.getSession({
      headers: new Headers({
        cookie: "better-auth.session_token=not-a-real-token",
      }),
    });
    expect(garbage).toBeNull();
  });

  it("revokes the session on sign out", async () => {
    const email = nextEmail();
    await signUp(email);
    const signIn = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    const cookie = (signIn.headers.get("set-cookie") ?? "").split(";")[0]!;

    await auth.api.signOut({ headers: new Headers({ cookie }) });

    const after = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(after).toBeNull();
  });
});

describe("rate limiting", () => {
  /**
   * The limiter is HTTP middleware, so it must be exercised through
   * auth.handler — direct auth.api.* calls bypass it by design.
   */
  async function postSignIn(email: string, ip: string): Promise<number> {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ email, password: "wrong-password-1" }),
      }),
    );
    return response.status;
  }

  it("throttles repeated failed sign-in attempts from one address", async () => {
    const email = nextEmail();
    await signUp(email);

    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      statuses.push(await postSignIn(email, "203.0.113.7"));
    }

    // The custom rule allows 5 per minute; the rest must be 429, not 401.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(2);
  });

  it("tracks limits per client address, not globally", async () => {
    const email = nextEmail();
    await signUp(email);

    for (let i = 0; i < 8; i += 1) {
      await postSignIn(email, "198.51.100.1");
    }
    // A different address must still get through to the credential check.
    expect(await postSignIn(email, "198.51.100.99")).toBe(401);
  });
});

describe("password reset", () => {
  it("issues a verification token on request", async () => {
    const email = nextEmail();
    await signUp(email);

    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    });

    const tokens = await prisma.verification.findMany();
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("does not reveal whether the account exists", async () => {
    // Must resolve (not throw) for unknown emails.
    await expect(
      auth.api.requestPasswordReset({
        body: { email: nextEmail(), redirectTo: "/reset-password" },
      }),
    ).resolves.toBeTruthy();
  });
});
