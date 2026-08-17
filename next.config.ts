import type { NextConfig } from "next";

/**
 * Security headers applied to every response. These are the low-risk,
 * high-value ones that need no per-page nonce:
 *
 * - HSTS pins HTTPS for a year (browsers ignore it over plain HTTP, so it is
 *   safe to send everywhere).
 * - `nosniff` stops MIME-sniffing; `X-Frame-Options: DENY` blocks clickjacking.
 * - A tight Referrer-Policy and Permissions-Policy withhold the referrer path
 *   cross-origin and disable device APIs the app never uses.
 *
 * A full script `Content-Security-Policy` is deliberately deferred: doing it
 * safely under Next's hydration needs per-request nonces and careful testing,
 * and a half-configured CSP silently breaks pages.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Emit a self-contained server bundle (`.next/standalone`) that ships only
  // the files and dependencies actually used, for a lean production Docker
  // image. See the Dockerfile and docs/deployment.md.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
