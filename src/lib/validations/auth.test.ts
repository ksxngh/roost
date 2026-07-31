import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validations/auth";

const valid = {
  name: "Alex Chen",
  email: "alex@example.com",
  password: "a".repeat(PASSWORD_MIN_LENGTH),
};

describe("signupSchema", () => {
  it("accepts a valid signup", () => {
    expect(signupSchema.parse(valid)).toEqual(valid);
  });

  it("trims the name", () => {
    const parsed = signupSchema.parse({ ...valid, name: "  Alex  " });
    expect(parsed.name).toBe("Alex");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(signupSchema.safeParse({ ...valid, name: "   " }).success).toBe(
      false,
    );
  });

  it("rejects an invalid email", () => {
    for (const email of ["", "nope", "a@b", "a @b.com"]) {
      expect(signupSchema.safeParse({ ...valid, email }).success).toBe(false);
    }
  });

  it("rejects a password below the minimum length", () => {
    const result = signupSchema.safeParse({
      ...valid,
      password: "a".repeat(PASSWORD_MIN_LENGTH - 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password above the maximum length", () => {
    const result = signupSchema.safeParse({
      ...valid,
      password: "a".repeat(PASSWORD_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unreasonably long name", () => {
    expect(
      signupSchema.safeParse({ ...valid, name: "x".repeat(101) }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts any non-empty password (policy is not disclosed on login)", () => {
    const result = loginSchema.safeParse({
      email: valid.email,
      password: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(
      loginSchema.safeParse({ email: valid.email, password: "" }).success,
    ).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a valid email and rejects an invalid one", () => {
    expect(forgotPasswordSchema.safeParse({ email: valid.email }).success).toBe(
      true,
    );
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(
      false,
    );
  });
});

describe("resetPasswordSchema", () => {
  it("enforces the same password policy as signup", () => {
    expect(
      resetPasswordSchema.safeParse({ password: valid.password }).success,
    ).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: "short" }).success).toBe(
      false,
    );
  });
});
