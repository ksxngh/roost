import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { serverEnv } from "@/lib/env";
import { siteConfig } from "@/lib/site-config";
import { PASSWORD_MIN_LENGTH } from "@/lib/validations/auth";
import { redisRateLimitStorage } from "@/server/auth-rate-limit-storage";
import { prisma } from "@/server/db";
import { createMailer } from "@/server/mailer";

const env = serverEnv();
const mailer = createMailer();

/** True when Google OAuth credentials are configured. */
export const googleAuthEnabled = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

/**
 * Origins Better Auth accepts sign-in/up requests from, beyond the baseURL.
 *
 * On Vercel a user may hit the stable production alias *or* the
 * deployment-specific URL, and preview deploys each have their own host. We
 * trust the current deployment's `VERCEL_URL` and the production domain so the
 * origin check never blocks a legitimate request against our own deployments —
 * without opening up to every `*.vercel.app`.
 */
function trustedOrigins(): string[] {
  const origins = new Set([siteConfig.url]);
  // Vercel-injected platform vars, not part of our app config contract.
  const { VERCEL_URL, VERCEL_PROJECT_PRODUCTION_URL } = process.env;
  if (VERCEL_URL) origins.add(`https://${VERCEL_URL}`);
  if (VERCEL_PROJECT_PRODUCTION_URL) {
    origins.add(`https://${VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return [...origins];
}

export const auth = betterAuth({
  appName: siteConfig.name,
  baseURL: siteConfig.url,
  trustedOrigins: trustedOrigins(),
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
  // Credential endpoints are the highest-value target in the app. Enabled in
  // every environment (not just production) and backed by Redis, so the limits
  // hold across instances instead of resetting per process. See
  // `auth-rate-limit-storage.ts` and docs/auth.md.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customStorage: redisRateLimitStorage(),
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
