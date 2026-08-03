# Changelog

All notable changes are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow semver
(pre-1.0: minor = milestone).

## [0.8.0] — 2026-08-02 · Milestone 4: Marketplace & booking

The marketplace works end to end: a customer finds a pro, picks a real time,
and books it; the provider accepts or declines from their schedule.

### Added

- **Booking flow** (`/pro/<slug>/book`): pick a slot, give contact and
  address details, get a reference. No account required — a homeowner
  shouldn't have to sign up to hire someone. Signed-in customers get the
  booking linked to their account.
- **Booking confirmation** (`/booking/<reference>`): status, time, address,
  and the business's contact details.
- **Provider schedule** (`/schedule`): requests waiting on a reply and
  confirmed work, with accept, decline, complete, and cancel.
- **Notification mail** to both sides when a booking is requested, addressed
  in the business's timezone.
- **Double-booking prevention as a database constraint** — a Postgres
  `EXCLUDE USING gist` over `(businessId, tstzrange(startAt, endAt))`, so two
  customers cannot hold the same slot regardless of timing. See
  [docs/booking.md](docs/booking.md).
- 112 new tests, including eight genuinely concurrent booking attempts where
  exactly one wins.

### Changed

- Availability now subtracts live bookings, using the same `PENDING` +
  `CONFIRMED` set the database constraint enforces.
- `startAt`/`endAt` are `timestamptz`: Prisma's default zone-less
  `timestamp` makes `tstzrange` non-immutable and unindexable, and these are
  instants anyway.

### Security

- Booking submission is rate limited per client address, since it is
  unauthenticated.
- Booking references are CSPRNG-generated with rejection sampling, from an
  alphabet that omits characters people misread aloud. The confirmation page
  is `noindex` and rejects malformed references before querying.
- `getBookingByReference` excludes the customer's email and phone: the
  reference proves you made the booking, not that you get a contact dump.

## [0.7.0] — 2026-08-01 · Milestone 3: Services & availability

Providers can now publish priced services and the hours they work, and the
marketplace shows real bookable times instead of a phone number.

### Added

- **Service packages** (`/services`): name, description, duration, optional
  buffer, and `FIXED` / `HOURLY` / `QUOTE` pricing. Money is stored as integer
  cents; the form edits dollars and rounds at the boundary.
- **Weekly hours, days off, and booking rules** (`/availability`): per-day
  opening windows, whole-day closures, business timezone, notice required, and
  how far ahead customers may book.
- **Slot generation** (`generateSlots`): a pure, database-free function that
  turns hours into concrete bookable instants, honouring closures, buffers,
  notice periods, and daylight-saving transitions.
- **`src/lib/time.ts`**: wall-clock ↔ instant conversion for a named IANA
  zone, built on `Intl.DateTimeFormat` with no new dependency. Handles the
  hour spring-forward erases and the hour fall-back repeats.
- **Public storefronts** now list services with prices and the next seven days
  of real openings, keyed by slug so no internal id is exposed.
- 200 new tests, including exhaustive daylight-saving coverage.

### Changed

- The storefront readiness checklist gained `packages` and `hours` checks, so
  a business can no longer be submitted for review with nothing bookable.
  `submitForReview` now requires seven checks rather than five.

### Removed

- `mammoth`, `jszip`, `tesseract.js`, and `@aws-sdk/s3-request-presigner` —
  dead since the Milestone 1 pivot removed the document-parsing pipeline.

### Documentation

- New [services & availability](docs/scheduling.md) guide covering the
  timezone model and the slot rules.

## [0.6.0] — 2026-08-01 · Milestone 2: Provider onboarding & storefront

A provider can now sign up, create their business, describe it, say where they
work, upload their licence and insurance, and submit for verification — and
the public marketplace can find them once an admin approves.

### Added

- **Onboarding** (`/onboarding`): name, trades, and coverage areas, creating
  the business and the creator's OWNER seat in one transaction. Public slugs
  are derived from the name, deduplicated, and checked against a reserved
  list so a storefront can never shadow a real route.
- **Access layer** (`src/server/businesses/access.ts`): membership-based
  authorization with `requireMembership` / `requireEditor` / `requireOwner`.
  Non-members get a not-found error rather than a permission error, so a
  stranger cannot learn that a business id exists.
- **Storefront management** (`/storefront`): profile editing, service-area
  add/remove, a readiness checklist, and submission for review. Submission
  sets `PENDING_REVIEW` and never `ACTIVE` — nothing a provider controls can
  list a business unverified.
- **Verification documents**: `BusinessDocument` model, multipart upload at
  `POST /api/documents`, and an authorization-checked download at
  `GET /api/documents/[id]`. Type is decided by magic bytes rather than the
  browser's claim; storage keys are generated; a failed insert deletes the
  stored object; uploads are rate limited per user.
- **Public marketplace**: `/browse` (city + province search, optional trade
  filter, case-insensitive matching) and `/pro/[slug]`. Every unauthenticated
  query filters `status: ACTIVE` and selects an explicit column list.
- 118 new tests covering cross-business rejection of every read and write,
  concurrent slug collisions, disguised file uploads, and the guarantee that
  no non-`ACTIVE` business appears in any public query.

### Fixed

- A flaky rate-limit test: two calls with a one-second fixed window could
  straddle a real window boundary. The clock is now pinned.

### Documentation

- New [providers & storefronts](docs/storefront.md) guide.
- README, architecture, database, and testing docs updated — they still
  described the study platform in places after the Milestone 1 pivot.

## [0.5.0] — 2026-08-01 · Milestone 1: Pivot to Roost

**Product direction changed.** The project was previously an AI study
platform. After reviewing padpal.com directly, the target was corrected to a
home-services marketplace plus provider operations software. Renamed
StudyForge → Roost.

### Added

- Core domain: `Business` (the provider org and tenant boundary),
  `BusinessMember` (team seats with OWNER/ADMIN/MEMBER roles),
  `ServiceCategory` (26 seeded trades with stable public slugs),
  `BusinessCategory`, and `ServiceArea` (city coverage — the data behind
  "no providers serve this city yet").
- Seed script (`npm run seed`) for the service-category reference data.
- Provider application shell: dashboard, schedule, clients, quotes, invoices,
  and storefront, with metrics ordered the way a service business checks in.
- Marketplace landing page addressing both audiences — homeowners above,
  providers in a visually distinct band below.

### Removed

- Document parsers (PDF/DOCX/PPTX/OCR), the library UI, and the study domain
  models (`Class`, `Folder`, `Document`, `DocumentPage`, `Tag`).
- The document-processing worker entry point. The BullMQ queue and Redis
  wiring are retained for payout and notification jobs in Milestone 5.

### Retained

Everything below the domain layer carried over unchanged: Next.js foundation,
design system, Postgres + Prisma, Better Auth with Google, sessions and route
protection, the mailer abstraction, Redis rate limiting, storage drivers
(local + S3), upload validation, CI, and the test harness.

### Changed

- Databases renamed `studyforge`/`studyforge_test` → `roost`/`roost_test`.
- Migration history reset to a single initial migration, since the prior
  chain described a product that no longer exists.

## [0.4.0] — 2026-07-31 · Milestone 3B: Library UI

### Added

- Library page with URL-driven views: all documents, per class, per folder,
  favorites, archived, trash, and title search — every filter shareable and
  refresh-safe.
- Class management: create, rename, archive, delete, with per-class document
  counts. Deleting a class detaches its documents rather than destroying them.
- Folders with create, rename, and delete, scoped to a class or the library
  root.
- Tags: create, apply, remove, and delete from a picker on each document.
- Move dialog for filing a document into a class and folder, with folder
  options filtered to the chosen class.
- Drag-and-drop upload with per-file progress and inline, dismissible errors.
- Live processing status: documents show Queued → Reading → Ready without a
  manual refresh, polled only while work is outstanding.
- Document actions: rename, move, tag, favorite, archive, trash; restore and
  delete-forever from the trash view.
- Server Actions layer with a shared wrapper handling auth, revalidation, and
  safe error translation.
- `docs/library.md` covering the ownership model, deletion semantics, and
  accessibility decisions.

### Security

- Every library query and mutation is scoped by `userId` in the data layer,
  so a component cannot leak another user's data by omitting a check.
- Cross-user access raises `NotFoundError` — existence is never confirmed to
  a non-owner. The integration suite asserts this for every mutation.
- `moveFolder` rejects moving a folder into itself or any descendant, which
  would otherwise orphan the subtree.

### Fixed

- Page counts read "1 pages"; added a `pluralize` helper with tests.
- Class and folder links announced as "Biology3" to screen readers — the
  count ran into the name. They now carry explicit labels ("Biology, 3
  documents") with the visible count hidden from assistive tech.
- Replaced a state-syncing effect in the rename dialog and a render-phase ref
  write in the status watcher with the idiomatic React patterns.
- Added Pointer Capture and `scrollIntoView` polyfills to the test setup;
  without them Radix Select and DropdownMenu never render content in jsdom.

### Known limitations

- Folders are one level deep in the UI; nesting is supported by the schema
  and service layer (with cycle prevention) but has no navigation yet.
- Search matches document titles only — content search arrives with
  Milestone 4's embeddings.

## [0.3.0] — 2026-07-31 · Milestone 3A: Content pipeline

### Added

- Domain schema: classes, nestable folders, documents, per-page extracted
  text, tags, and the document/tag join — with soft delete, favorites,
  archiving, and per-user checksum uniqueness.
- `Storage` abstraction with a filesystem driver (default, atomic writes) and
  an S3-compatible driver for AWS S3, Cloudflare R2, and MinIO.
- `POST /api/documents`: authenticated multipart upload with validation,
  duplicate detection, and job enqueueing.
- Text extraction for PDF (`unpdf`), Word (`mammoth`), PowerPoint (`jszip`,
  one page per slide), plain text/Markdown, and images via OCR
  (`tesseract.js`). Formats without real pages are paginated on paragraph
  boundaries so citations stay coherent.
- BullMQ queue on Redis plus a standalone worker process (`npm run worker`)
  with retries, exponential backoff, dedupe, and graceful drain on SIGTERM.
- Redis fixed-window rate limiter shared across instances, applied to uploads
  (30 per 10 minutes per user).
- CI gains a `redis:8-alpine` service container.
- `docs/content-pipeline.md` documenting the flow, validation rules, drivers,
  parsers, and known limitations.

### Security

- Uploads are validated by **magic bytes**, not the browser-supplied MIME
  type: an executable renamed `.pdf` is rejected, as is binary content
  disguised as `.txt`.
- Storage keys are generated server-side (`<userId>/<uuid>.<ext>`) and
  validated against traversal, absolute paths, backslashes, and null bytes;
  filenames never reach the filesystem.
- Filing a document into another user's class or folder is rejected
  (IDOR prevention), covered by tests.
- S3 objects are written with `Content-Disposition: attachment` so user
  content cannot render inline from the bucket origin.
- Parse failures surface student-facing messages; internal errors and stack
  traces never reach the UI.

### Fixed

- BullMQ rejects custom job ids containing `:`, which would have thrown on
  every upload. Job ids now use `document-<id>`, with a regression test.
- The worker process did not load `.env`, so it could not start outside
  Next.js. It now uses Node's `--env-file-if-exists`.
- Test files now run sequentially: integration suites share one database and
  were deleting each other's fixtures when run in parallel.

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
