import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { serverEnv } from "@/lib/env";
import { siteConfig } from "@/lib/site-config";
import { PASSWORD_MIN_LENGTH } from "@/lib/validations/auth";
import { prisma } from "@/server/db";
import { createMailer } from "@/server/mailer";

const env = serverEnv();
const mailer = createMailer();

/** True when Google OAuth credentials are configured. */
export const googleAuthEnabled = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

export const auth = betterAuth({
  appName: siteConfig.name,
  baseURL: siteConfig.url,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    cookieCache: {
      // Signed session snapshot in the cookie: most requests resolve the
      // session without a database round trip, revalidating every 5 minutes.
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  // Credential endpoints are the highest-value target in the app; throttle
  // them regardless of the global limiter that arrives with Redis.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60 * 60, max: 10 },
      "/request-password-reset": { window: 60 * 60, max: 5 },
      "/reset-password": { window: 60 * 60, max: 10 },
    },
  },
  advanced: {
    // Secure cookies whenever the app is served over HTTPS.
    useSecureCookies: siteConfig.url.startsWith("https://"),
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    sendResetPassword: async ({ user, url }) => {
      await mailer.send({
        to: user.email,
        subject: `Reset your ${siteConfig.name} password`,
        text: [
          `Hi ${user.name || "there"},`,
          "",
          `Someone (hopefully you) requested a password reset for your ${siteConfig.name} account.`,
          "Open this link to choose a new password:",
          "",
          url,
          "",
          "If you didn't request this, you can safely ignore this email.",
        ].join("\n"),
      });
    },
  },
  emailVerification: {
    // Verification mail goes out on signup; sign-in is not blocked on it
    // until a production email provider is configured (see docs/adr/0002).
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await mailer.send({
        to: user.email,
        subject: `Verify your ${siteConfig.name} email`,
        text: [
          `Welcome to ${siteConfig.name}, ${user.name || "there"}!`,
          "",
          "Confirm your email address by opening this link:",
          "",
          url,
        ].join("\n"),
      });
    },
  },
  socialProviders: googleAuthEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : undefined,
  // nextCookies must stay last so cookies set inside server actions work.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
