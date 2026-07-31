# Changelog

All notable changes to StudyForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow semver
(pre-1.0: minor = milestone).

## [0.2.0] — 2026-07-31 · Milestone 2: Database & Auth

### Added

- PostgreSQL 18 + Prisma 7 with the `@prisma/adapter-pg` driver adapter and a
  HMR-safe client singleton.
- Better Auth: email/password sign-up and sign-in, email verification,
  password reset, and Google OAuth that activates automatically when
  credentials are configured.
- Auth pages (`/login`, `/signup`, `/forgot-password`, `/reset-password`)
  built on react-hook-form + Zod, with accessible inline validation.
- Route protection for the entire `(app)` group via a server-layout session
  gate; signed-in users are redirected away from auth pages.
- User menu with avatar initials and sign-out; Settings now shows real
  account data and email verification status.
- `Mailer` abstraction with console (development) and Resend (production)
  transports.
- Integration test infrastructure: a real PostgreSQL test database with
  migrations applied per run, plus a CI service container.

### Security

- Rate limits on credential endpoints: 5 sign-ins/minute, 10 sign-ups/hour,
  5 password-reset requests/hour, keyed by client address.
- Session cookies are `httpOnly`/`sameSite=lax`, with `secure` enabled
  automatically over HTTPS; 30-day expiry with a 5-minute signed cookie cache.
- Uniform responses for wrong passwords, unknown emails, and password-reset
  requests, so none of them disclose whether an account exists.
- `BETTER_AUTH_SECRET` is validated at boot for minimum length.

### Changed

- `env.ts` now validates lazily via `serverEnv()`; `DATABASE_URL` and
  `BETTER_AUTH_SECRET` are required.
- Landing page CTAs point at `/signup` and `/login` instead of `/dashboard`.

### Known limitations

- Rate-limit counters are in-memory (per-instance) until Redis lands in
  Milestone 3.
- Email verification is sent but not enforced at sign-in.

## [0.1.0] — 2026-07-31 · Milestone 1: Foundation

### Added

- Next.js 16 (App Router) scaffold with strict TypeScript, Tailwind CSS v4,
  and shadcn/ui (radix base, 19 primitives).
- Dark-first design system: oklch token palette (brand hue 285), light mode,
  `next-themes` with system preference support and no-flash hydration.
- Authenticated app shell: desktop sidebar, mobile drawer navigation, sticky
  topbar with theme toggle; placeholder pages for Dashboard, Library,
  Flashcards, Quizzes, AI Chat, Guides, and Settings with consistent
  empty states.
- Marketing landing page.
- Validated environment configuration (`src/lib/env.ts`, Zod) with
  scheme-checked connection URLs.
- Test infrastructure: Vitest + Testing Library, 28 tests across env
  validation, utilities, navigation config, and interactive components.
- CI: GitHub Actions running lint, format check, typecheck, tests, build.
- Documentation: README, architecture (with diagrams), roadmap, testing
  guide, ADRs 0001–0003.

### Security

- Resolved all `npm audit` findings via targeted overrides
  (`sharp ^0.35`, `postcss ^8.5.18`); audit is clean.
