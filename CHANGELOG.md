# Changelog

All notable changes are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow semver
(pre-1.0: minor = milestone).

## [0.18.0] — 2026-08-10 · Milestone 11c: Accessibility pass

Keyboard and screen-reader scaffolding across the shells.

### Added

- **Skip-to-main-content link** (`SkipLink`) — the first focusable element on
  the home page, the provider app shell, and the admin shell. Hidden until
  focused, then moves focus to `<main id="main-content" tabindex="-1">`.
- A `label` prop on `SidebarNav` so the two nav lists announce as distinct
  landmarks ("Main navigation" and "Settings") instead of two identical ones.
- 3 new tests.

### Changed

- The admin top-bar nav is now a labelled landmark.

### Notes

- The audit confirmed existing hygiene holds: every icon-only button already
  carries an `aria-label`, every dialog a title, no image lacks `alt`, and
  tests query by role/accessible name so regressions surface as test failures.
- Deferred with the rest of E2E: automated axe-core and Playwright keyboard
  flows.

## [0.17.0] — 2026-08-10 · Milestone 11b: Redis-backed auth rate limiting

Credential-endpoint rate limits now hold across instances instead of resetting
per process.

### Added

- **`redisRateLimitStorage`** — a Better Auth `customStorage` backed by the
  shared Redis. The atomic `consume` path (one `INCR`, window TTL set only on
  creation) closes the concurrent-bypass gap of a get-then-set limiter; the
  legacy `get`/`set` members are implemented with a bounded TTL to satisfy the
  interface.
- 5 new tests (count-to-limit, key isolation, window expiry, fail-open, record
  round-trip).

### Changed

- Better Auth's limiter moves from per-instance memory to Redis. Behind more
  than one instance an in-memory limiter multiplied the effective limit by the
  instance count and let brute force spread across processes; the shared store
  makes each limit global. The limits themselves are unchanged.
- The limiter **fails open** on a Redis outage (request allowed, failure
  logged): locking users out of sign-in during a cache blip is worse than
  briefly losing one layer of defence.

## [0.16.0] — 2026-08-10 · Milestone 11a: Admin & verification queue

The marketplace can finally publish a business. A platform-operator surface at
`/admin` turns a submitted business into a listed one — and can pull it back.

### Added

- **Platform roles** — `PlatformRole` (`USER`/`STAFF`/`ADMIN`) on the user,
  orthogonal to per-business roles. STAFF read the queue; ADMIN decides. Ranked
  by one pure `meetsPlatformRole` check. Granted only out of band via
  `npm run grant-admin` — no in-app path, so an app account can't escalate.
- **Verification queue** (`/admin/verification`) — pending businesses oldest
  first, each opening to a review page with the business's details, its
  licence/insurance documents, and full moderation history.
- **Moderation workflow** — approve (→ ACTIVE, stamps `verifiedAt`), reject
  (→ DRAFT), suspend (→ SUSPENDED), reinstate (→ ACTIVE). A transition table
  makes every decision status-checked, so the UI only offers valid actions and
  the service can't be driven into an illegal move. Status change, verification
  stamp, and audit row commit in one transaction guarded by the current status.
- **`BusinessReview`** — an append-only audit trail: one row per decision with
  reviewer, action, from/to status, and reason; never updated or deleted, and
  retained (`SetNull`) even if the reviewer's account is later removed.
- **Admin document proxy** (`/api/admin/documents/[id]`) — serves any
  business's credentials to a reviewer, gated on platform role, with the same
  forced-download/`nosniff`/`no-store` hardening as the provider route; 404 to
  non-reviewers.
- **Outcome emails** to the business on approve/reject/suspend/reinstate, sent
  only after the decision commits.
- `docs/admin.md`; 11 new tests.

### Changed

- Provider app menu shows an **Admin** link to staff and admins.

### Notes

- A suspend/reinstate keeps the original `verifiedAt` — verification is a fact
  about when credentials were checked, not undone by a suspension.

## [0.15.0] — 2026-08-10 · Milestone 10: Subscriptions

Roost earns its own revenue: providers subscribe to a plan tier through Stripe
Billing. Distinct from Connect payments (money for a booking) and invoicing (a
provider billing a client) — here Roost is the merchant.

### Added

- **`Subscription`** model — one per business, mirroring Stripe: `tier`,
  `status` (`ACTIVE`/`TRIALING`/`PAST_DUE`/`CANCELED`/`INCOMPLETE`),
  `currentPeriodEnd`, `cancelAtPeriodEnd`, and the unique Stripe customer and
  subscription ids.
- **Checkout** (`/settings/billing`) — monthly or annual, Pro or Premium, via a
  Stripe Checkout session in subscription mode. A per-business Stripe customer
  is created once and reused. Owner-only.
- **Billing portal** — owners update the card or cancel; configured for
  cancellation and payment method only, not plan switching.
- **Seat-aware downgrade guard** — checkout refuses a plan whose seats are
  fewer than the current team size, the one place a plan change is initiated.
- **Webhook-driven entitlement** — `customer.subscription.created/updated/
  deleted` set `Business.plan` from the subscription's paying status; a
  customer-ownership check rejects spoofed `metadata.businessId`. State is only
  ever written from the verified, idempotent webhook, never the redirect.
- **Graceful degradation** — without the `STRIPE_PRICE_*` env vars the billing
  page renders a read-only "not available on this deployment" state; nothing
  throws.
- `docs/subscriptions.md`; 41 new tests.

### Changed

- `checkout.session.completed` in the webhook now branches on `mode`:
  subscription sessions are acknowledged and left to the subscription events.

### Notes

- Live billing needs real Stripe price IDs and a webhook secret, supplied by
  the deployer. `DEFAULT_PLAN` remains Premium during the pre-billing phase;
  going live flips it to a restricted default or requires checkout at
  onboarding.

## [0.14.0] — 2026-08-05 · Milestone 9: Teams & permissions

Invite a team, cap it to the plan's seats, and grant each member exactly what
they should be able to do.

### Added

- **Invitations**: invite by email with a role and, for members, a set of
  capabilities. A CSPRNG token is emailed and never listed back; accepting
  requires the signed-in email to match the invited address.
- **Granular capabilities** — `SCHEDULE`, `BILLING`, `CLIENTS`, `STOREFRONT`.
  OWNER and ADMIN hold all four; a MEMBER holds only what is granted. Every
  mutation gate moved from `requireEditor` to `requireCapability`.
- **Plan-based seat limits** (1 on Pro, 8 on Premium), enforced at invite
  time counting pending invites, and again inside the accept transaction so a
  team cannot overflow through a race.
- **Team management** (`/settings/team`): invite, revoke, change a member's
  role and capabilities, remove, with rank rules that stop an admin escalating
  itself or touching the owner. Ownership transfer exists at the service layer.
- `/invite/<token>` accept page.
- 48 new tests.

### Changed

- `requireEditor` now means only "admin or owner" and guards team management
  alone. The pricing page's "Invite employees" and "Granular permissions"
  rows flip from Soon to live.

### Notes

- Billing is still Milestone 10, so a new business defaults to the Premium
  tier — nobody is charged yet, so gating team features behind an impossible
  payment would help no one.

## [0.13.0] — 2026-08-05 · Milestone 8: Client CRM

The client list builds itself from the work, with no "add client" button.

### Added

- **`Client`** model, keyed by `(businessId, lower(email))`. Bookings,
  quotes, and invoices all resolve to one through `linkClient` at creation.
- **`/clients`** with search across name, email, phone, and city, showing job
  count and lifetime value; **`/clients/[id]`** with full history, contact
  details, private notes, and archiving.
- **Backfill migration** reconstructing clients from every existing booking,
  quote, and invoice — an established business's list is not empty on day
  one.

### Changed

- Lifetime value counts **paid invoices only**; billed-but-unreceived money
  is shown separately as outstanding.
- The pricing page's "Client list and job history" row is now live rather
  than Soon.

### Fixed

- `linkClient` stored postal codes and provinces exactly as typed while the
  documents upper-cased them, so a client record could read `v5h 2k9` where
  its own booking said `V5H 2K9`. Normalisation moved inside `linkClient` so
  every call site is right.

## [0.12.0] — 2026-08-05 · Milestone 7: Quotes & invoicing

Work that could not be priced online can now be quoted, agreed, invoiced, and
paid.

### Added

- **Quotes** (`/quotes`): line items with quantities and unit prices, tax
  presets per province, an optional deposit and expiry, and notes split into
  customer-facing and internal.
- **Customer approval** (`/quote/<reference>`): accept, or decline with a
  reason. No account needed — holding the reference is the authorisation.
- **Invoices** (`/invoices`, `/invoice/<reference>`) raised from an accepted
  quote or standalone, sequentially numbered per business, payable through
  the same Stripe Connect checkout as a booking.
- **`src/lib/money.ts`**, the single place any total is computed. Quantities
  are hundredths of a unit, prices are cents, and nothing is a float. The
  line editor computes its running total with the same functions the server
  uses, so what a provider sees while typing is what gets stored.
- Quote and invoice email to both sides.
- 128 new tests.

### Changed

- The pricing page's "Quotes and invoicing" row flips from **Soon** to
  included, and the test that guards unbuilt claims was updated with it.

### Fixed

- `listBusinessDocuments` ordered only by `createdAt`, so two documents
  uploaded in the same millisecond came back in whatever order the planner
  chose and the list could reorder itself between renders. Now tie-broken by
  id. Surfaced as an intermittent test failure that passed in isolation.

## [0.11.0] — 2026-08-04 · Plans & pricing

### Added

- **Public pricing page** (`/pricing`) with a two-tier plan comparison:
  Roost Pro at **$129.99 CAD/month** (1 seat) and Roost Premium at
  **$214.99** (up to 8 seats), each **$15/month under** Padpal's comparable
  tier. Annual billing quoted at ten months for twelve.
- `src/lib/plans.ts` as the single source of truth for prices, seats, and the
  feature grid — the page hardcodes no numbers.
- Every comparison row carries a `live`/`soon` status. Unbuilt capability
  renders a **Soon** badge rather than a tick, and a test fails if any of the
  named unbuilt features is ever marked live.

### Changed

- **Marketplace fee cut from 10% to 8%**, undercutting Padpal's 9%.
  Undercutting the subscription while charging a higher take rate would lose
  the comparison on the largest jobs. A test asserts the advertised rate and
  the rate checkout applies are the same number.

### Fixed

- Two dead links on the public landing page: "For business" and "List your
  business" pointed at `/for-business`, which 404s, and the homeowner "Find a
  pro" button pointed at `/services` — the _provider's_ protected service
  editor, which bounced visitors to sign-in. They now go to `/pricing` and
  `/browse`.

## [0.10.0] — 2026-08-04 · Milestone 6: Jobs & scheduling ops

The provider's side of a booked job: seeing it, assigning it, and being
reminded about it. The background worker returns.

### Added

- **Week calendar, day sheet, and list views** on `/schedule`, each linkable
  by query string. Times are formatted server-side in the business's
  timezone.
- **Job assignment** to a team member, with the picker appearing only when
  there is more than one seat. Assigning a seat from another business is
  refused; deleting a seat unassigns its work rather than deleting it.
- **Internal notes** on a booking — parking, equipment, warnings — shown to
  the provider and never to the customer.
- **Background worker** (`npm run worker`) with two recurring sweeps:
  booking reminders 24 hours ahead, and licence/insurance expiry warnings 30
  days ahead. Both are idempotent on a marker column written after the mail
  is accepted, so a crash re-sends rather than silently swallowing.

### Fixed

- **`timestamptz` values were being stored offset by the database server's
  timezone.** The driver sent naive wall-clock text and Postgres interpreted
  it in its own zone; reads were distorted by the same amount, so a
  write-then-read round trip agreed perfectly while the instant on disk was
  wrong by seven hours. SQL comparisons against `now()` were wrong, and the
  distortion changes size across a daylight-saving boundary, so rows written
  in summer and winter would stop being comparable — including for
  `booking_no_overlap`. The Prisma session is now pinned to UTC, with a
  regression test that reads `extract(epoch)` rather than round-tripping.

### Changed

- The queue was still the study platform's document-processing queue. It is
  now the jobs queue, with repeatable schedules installed idempotently on
  worker boot.

## [0.9.0] — 2026-08-04 · Milestone 5: Payments

Customers can pay by card at booking. Money goes to the provider's own Stripe
account; Roost takes a platform fee. Payments are optional — with no Stripe
keys the app runs exactly as before.

### Added

- **Stripe Connect onboarding** (`/settings/payments`): owner-only, with a
  live capability checklist mirrored from Stripe.
- **Hosted Checkout at booking** for fixed-price services on a connected
  account. Card details never touch our origin.
- **Platform fee** via Stripe's application fee, configurable through
  `PLATFORM_FEE_BPS`, rounded down so rounding never costs the
  provider more than the stated rate.
- **Signed webhook endpoint** (`/api/stripe/webhook`) handling checkout
  completion, expiry, failure, refunds, and account updates.
- **Automatic full refund** when a paid booking is declined or cancelled,
  including the platform fee.
- Payment status on both the customer's booking page and the provider's
  schedule.
- 74 new tests, including real HMAC signature verification against forged
  signatures, tampered bodies, and out-of-tolerance replays.

### Fixed

- **`Booking.startAt`/`endAt` had lost their `@db.Timestamptz(3)` attributes
  in the schema** while the database still had the right type. The next
  generated migration would have reverted the columns to a zone-less
  `timestamp` and broken the exclusion constraint that prevents double
  booking. Restored, with a comment explaining why they must stay.
- Availability read already-booked time using the wall clock while generating
  slots from an injected `now`. The two now share one clock; previously any
  time-travelling caller got inconsistent answers.

### Security

- A payment is only marked received on a signature-verified webhook, never
  because a browser returned from checkout.
- Webhook delivery, checkout creation, and refunds are each idempotent —
  Stripe retries and does not promise exactly-once delivery.
- The webhook returns `503` when unconfigured rather than a misleading `200`.
- Connecting a payout account is owner-only.

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
