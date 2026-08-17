# Testing

## Stack

- **Vitest** with the jsdom environment; config in `vitest.config.ts`.
- **@testing-library/react** for component tests, **user-event** for
  interactions, **jest-dom** matchers via `src/test/setup.ts`.

## Conventions

- Tests are colocated: `foo.ts` → `foo.test.ts` in the same directory.
- Query by **role and accessible name** (`getByRole("link", { name: … })`),
  never by class or test id — tests double as accessibility checks.
- Mock at the module boundary (`next/navigation`, `next-themes`), not deeper.
- Generated shadcn primitives in `src/components/ui/` are excluded from
  coverage; we test our composition of them instead.
- `src/test/setup.ts` polyfills the Pointer Capture API and `scrollIntoView`,
  which jsdom lacks and Radix primitives require — without them Select and
  DropdownMenu silently never render their content in tests.

## Running

```bash
npm run test            # single run (CI mode)
npm run test:watch      # watch mode
npm run test:coverage   # v8 coverage report
```

## Test layers

**Unit / component** tests run in jsdom and mock at module boundaries.

**Integration** tests run in the node environment against a real PostgreSQL
database. `src/test/global-setup.ts` points `DATABASE_URL` at
`roost_test` and runs `prisma migrate deploy` once per invocation, so
tests exercise the same migration chain that ships. Files are named
`*.integration.test.ts` and start with `// @vitest-environment node`.

Integration tests truncate tables between cases and assert the database name
contains `roost_test` before any destructive operation — a guard against
ever pointing the suite at a real database.

Test files run **sequentially** (`fileParallelism: false`): integration files
share one database and truncate tables between cases, so parallel files would
delete each other's fixtures. The suite runs in about nine seconds, so the
cost is negligible. Vitest projects separate the jsdom (`unit`) and node
(`integration`) environments.

CI runs the same suite against `pgvector/pgvector:pg18` (the pg18 image the
project already pinned; the vector extension is unused for now) and
`redis:8-alpine`
service containers via `TEST_DATABASE_URL` and `REDIS_URL`.

## Accessibility

Accessibility is enforced structurally, not bolted on. Every interactive
element is reached by role and accessible name in tests (so an icon-only button
without an `aria-label` fails its test), and the shells carry the landmark
scaffolding a screen-reader or keyboard user relies on:

- A **skip-to-main-content link** (`src/components/skip-link.tsx`) is the first
  focusable element on the home page and both shells (provider app, admin). It
  is `sr-only` until focused, then jumps focus to `<main id="main-content"
tabindex="-1">`.
- **Landmarks are uniquely labelled** — the two sidebar nav lists are "Main
  navigation" and "Settings" so they are distinguishable, and the admin bar's
  nav is labelled too. Icon-only controls all carry `aria-label`; decorative
  icons are `aria-hidden`.
- Focus is never suppressed without a visible replacement: buttons and links
  have `focus-visible` rings from the design system.

Deferred to a later slice: automated axe-core assertions and Playwright
keyboard-flow E2E (with the rest of E2E — see below).

## Current suite (949 tests)

| Area                                                    | Coverage                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/env`                                               | Required vars, defaults, malformed URLs, wrong schemes, short secret, unknown NODE_ENV                                                                                                                                                                                                          |
| `lib/utils` (`cn`)                                      | Merging, falsy handling, tailwind conflicts, empty input                                                                                                                                                                                                                                        |
| `lib/format`                                            | Byte scaling, relative-time boundaries, pluralization including irregulars                                                                                                                                                                                                                      |
| `lib/site-config`                                       | Metadata presence, duplicate hrefs, href/segment consistency                                                                                                                                                                                                                                    |
| `lib/validations/auth`                                  | Password policy bounds, email formats, name trimming, login-vs-signup asymmetry                                                                                                                                                                                                                 |
| `lib/validations/business`                              | Slug folding/truncation/pattern invariants, reserved slugs, category and area caps, phone and email formats, rejection of `javascript:`/`data:`/`ftp:` websites                                                                                                                                 |
| `server/mailer`                                         | Transport selection, console output, Resend request shape, API + network failures                                                                                                                                                                                                               |
| `server/auth` _(integration)_                           | Signup, password hashing, duplicate email, weak password, sign-in success/failure, session resolution, sign-out revocation, garbage tokens, per-IP rate limiting, reset-token issuance, no user enumeration                                                                                     |
| `server/businesses` _(integration)_                     | Transactional creation with an owner seat, concurrent same-name slug collisions, cross-business rejection of every read and write, role gates, readiness checks, that submission stops at `PENDING_REVIEW`, and that no non-`ACTIVE` business appears in any public query                       |
| `businesses/documents` _(integration)_                  | Magic-byte content sniffing, disguised executables and renamed images, size and extension limits, generated storage keys, orphan cleanup on insert failure, editor-only uploads, business-scoped deletes                                                                                        |
| `api/documents` _(integration)_                         | 401/403/429/400/413/500 paths, `Retry-After`, per-user rate-limit key, business id taken from the session rather than the body, no internal error leakage                                                                                                                                       |
| `api/documents/[id]` _(integration)_                    | Owner download, `attachment` + `nosniff` + `no-store` headers, 404 for another business's document and for users with no business                                                                                                                                                               |
| `server/db` _(integration)_                             | The connection session runs in UTC, and instants land in Postgres unchanged either side of a daylight-saving boundary — asserted via `extract(epoch)`, because a round trip cannot see this class of bug                                                                                        |
| `notifications/sweeps` _(integration)_                  | Reminders only for confirmed work, window boundaries, the marker left unset when mail fails so it retries, one bad address not stopping the sweep, assigned technician mailed instead of the business inbox, internal notes withheld from the customer; expiry warnings once only               |
| `queue` _(integration)_                                 | Real BullMQ delivery, job-id dedupe, retry/backoff, job-id format guard                                                                                                                                                                                                                         |
| `billing/prices` + `subscription` _(integration)_       | Price ↔ tier round-tripping, `subscriptionsConfigured` gating; customer create-and-reuse, owner-only checkout and portal, the seat-aware downgrade guard, paying-vs-cancelled entitlement mapping, and the webhook's rejection of spoofed `metadata.businessId`                                 |
| `admin/verification` _(integration)_                    | Platform-role ranking and gating, queue visibility and oldest-first ordering, each of the four moderation transitions, the stamp-once `verifiedAt`, the invalid-transition guard writing nothing, STAFF-read-vs-ADMIN-decide enforcement, and an attributable audit row with the reason emailed |
| `rate-limit` _(integration)_                            | Limit enforcement, remaining counts, per-key isolation, TTL, window rollover (with a pinned clock)                                                                                                                                                                                              |
| `auth-rate-limit-storage` _(integration)_               | The Redis storage Better Auth uses: atomic `consume` counts to the limit then blocks with a real retry-after, keys stay isolated, the window is set once (expires rather than slides), it fails open when Redis is down, and the `get`/`set` fallback round-trips with a bounded TTL            |
| `health` _(integration)_                                | Readiness reaches real Postgres and Redis and reports both healthy with latency; a thrown dependency flips `ready` to false and names the failure without tainting the others                                                                                                                   |
| `storage/local-storage`                                 | Round-trip, binary safety, atomic overwrite, missing keys, no temp-file leakage, path-traversal rejection (traversal, absolute, backslash, null byte)                                                                                                                                           |
| `OnboardingForm`                                        | Submit gating, value normalization, category cap and toggling, duplicate/removed areas, nested add-area form not submitting the outer form, server errors                                                                                                                                       |
| `ProfileForm` / `ServiceAreaEditor` / `SubmitForReview` | Prefill, null-vs-empty handling, trimming, province uppercasing, add/remove wiring, disabled-until-ready submission, surfaced server errors                                                                                                                                                     |
| `DocumentManager`                                       | Status badges and reviewer notes, authenticated download links, multipart body contents, rejection and network-failure reporting, refresh after upload, deletion                                                                                                                                |
| `SidebarNav`                                            | Landmark + links, aria-current on active/nested/unknown routes, empty list, onNavigate                                                                                                                                                                                                          |
| `ThemeToggle`                                           | Accessible trigger, menu options, setTheme wiring                                                                                                                                                                                                                                               |
| `EmptyState`                                            | Content rendering, optional action slot                                                                                                                                                                                                                                                         |

The signup → onboarding → storefront → upload → submit-for-review flow has
also been exercised manually in a real browser. Playwright E2E is scheduled
for Milestone 11 alongside the rest of the hardening work, once the feature
surface stops moving weekly.

## Known sharp edges

- **jsdom and file inputs.** Setting files programmatically leaves
  `input.value` empty, so a `required` file input reports itself invalid and
  clicking submit produces no submit event. `document-manager.test.tsx`
  submits the form directly and says why.
- **Fixed windows and real clocks.** Any rate-limit test that assumes two
  calls share a window must pin `Date.now`, or it will fail whenever the calls
  straddle a boundary.
- **Slot tests need an explicit `now`.** `generateSlots` filters anything
  before `now + leadHours`, so a test using a fixed past date must pass a
  `now` earlier than it — otherwise every assertion passes vacuously against
  an empty list.
- **Round trips can hide storage bugs.** Writing a value and reading it back
  through the same layer proves only that the layer is self-consistent. The
  timezone tests ask Postgres what it actually stored, and deliberately keep a
  round-trip assertion alongside — it passes even with the bug present.
- **Concurrency tests need real concurrency.** The double-booking test fires
  eight `createBooking` calls with `Promise.allSettled` so all of them read
  availability before any writes. Serialising them would pass against a
  read-then-write implementation and prove nothing.
- **Stripe is faked, not stubbed away.** Payment logic runs against a
  `StripeGateway` fake that records its arguments, so what we _send_ Stripe is
  asserted. Signature verification is the exception: those tests build real
  HMAC headers and run the actual SDK verification, because that is the part
  an attacker would target.
- **Radix needs jsdom shims.** Pointer capture, `scrollIntoView`, and
  `ResizeObserver` are all polyfilled in `src/test/setup.ts`; without them
  Dialog and Select render nothing and fail in ways that do not name the
  cause.
