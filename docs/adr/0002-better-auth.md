# ADR-0002: Better Auth over Auth.js

**Status:** Accepted (implementation in Milestone 2) · **Date:** 2026-07-31

## Decision

Use Better Auth for authentication.

## Rationale

- **Email/password is a first-class citizen** (verification, password reset,
  brute-force protection built in). Auth.js explicitly discourages credential
  auth and leaves those flows to the integrator.
- **Plugin ecosystem maps to our roadmap:** two-factor, organizations
  (future team/org feature), admin impersonation for support tooling.
- **Owns its schema** via the Prisma adapter with typed server-side session
  helpers that work cleanly in RSC and route handlers.
- Google OAuth is supported out of the box, same as Auth.js.

## Consequences

- Auth tables are generated/managed by Better Auth's CLI; our Prisma schema
  hosts them alongside domain tables.
- Session checks happen server-side in the `(app)` layout and in a middleware
  allowlist; API routes verify session per request.
