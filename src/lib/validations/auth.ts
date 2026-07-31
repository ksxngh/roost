import { z } from "zod";

/**
 * Shared auth form contracts. The password policy must match the server's
 * Better Auth configuration (minPasswordLength) — both read these constants.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const email = z.email("Enter a valid email address").max(254);

const password = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  );

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(100, "Name must be at most 100 characters"),
  email,
  password,
});

export const loginSchema = z.object({
  email,
  // Deliberately no length rule: never reveal the policy on login.
  password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  password,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
