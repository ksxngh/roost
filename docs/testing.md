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

## Current suite (635 tests)

| Area                                                    | Coverage                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/env`                                               | Required vars, defaults, malformed URLs, wrong schemes, short secret, unknown NODE_ENV                                                                                                                                                                                    |
| `lib/utils` (`cn`)                                      | Merging, falsy handling, tailwind conflicts, empty input                                                                                                                                                                                                                  |
| `lib/format`                                            | Byte scaling, relative-time boundaries, pluralization including irregulars                                                                                                                                                                                                |
| `lib/site-config`                                       | Metadata presence, duplicate hrefs, href/segment consistency                                                                                                                                                                                                              |
| `lib/validations/auth`                                  | Password policy bounds, email formats, name trimming, login-vs-signup asymmetry                                                                                                                                                                                           |
| `lib/validations/business`                              | Slug folding/truncation/pattern invariants, reserved slugs, category and area caps, phone and email formats, rejection of `javascript:`/`data:`/`ftp:` websites                                                                                                           |
| `server/mailer`                                         | Transport selection, console output, Resend request shape, API + network failures                                                                                                                                                                                         |
| `server/auth` _(integration)_                           | Signup, password hashing, duplicate email, weak password, sign-in success/failure, session resolution, sign-out revocation, garbage tokens, per-IP rate limiting, reset-token issuance, no user enumeration                                                               |
| `server/businesses` _(integration)_                     | Transactional creation with an owner seat, concurrent same-name slug collisions, cross-business rejection of every read and write, role gates, readiness checks, that submission stops at `PENDING_REVIEW`, and that no non-`ACTIVE` business appears in any public query |
| `businesses/documents` _(integration)_                  | Magic-byte content sniffing, disguised executables and renamed images, size and extension limits, generated storage keys, orphan cleanup on insert failure, editor-only uploads, business-scoped deletes                                                                  |
| `api/documents` _(integration)_                         | 401/403/429/400/413/500 paths, `Retry-After`, per-user rate-limit key, business id taken from the session rather than the body, no internal error leakage                                                                                                                 |
| `api/documents/[id]` _(integration)_                    | Owner download, `attachment` + `nosniff` + `no-store` headers, 404 for another business's document and for users with no business                                                                                                                                         |
| `queue` _(integration)_                                 | Real BullMQ delivery, job-id dedupe, retry/backoff, job-id format guard                                                                                                                                                                                                   |
| `rate-limit` _(integration)_                            | Limit enforcement, remaining counts, per-key isolation, TTL, window rollover (with a pinned clock)                                                                                                                                                                        |
| `storage/local-storage`                                 | Round-trip, binary safety, atomic overwrite, missing keys, no temp-file leakage, path-traversal rejection (traversal, absolute, backslash, null byte)                                                                                                                     |
| `OnboardingForm`                                        | Submit gating, value normalization, category cap and toggling, duplicate/removed areas, nested add-area form not submitting the outer form, server errors                                                                                                                 |
| `ProfileForm` / `ServiceAreaEditor` / `SubmitForReview` | Prefill, null-vs-empty handling, trimming, province uppercasing, add/remove wiring, disabled-until-ready submission, surfaced server errors                                                                                                                               |
| `DocumentManager`                                       | Status badges and reviewer notes, authenticated download links, multipart body contents, rejection and network-failure reporting, refresh after upload, deletion                                                                                                          |
| `SidebarNav`                                            | Landmark + links, aria-current on active/nested/unknown routes, empty list, onNavigate                                                                                                                                                                                    |
| `ThemeToggle`                                           | Accessible trigger, menu options, setTheme wiring                                                                                                                                                                                                                         |
| `EmptyState`                                            | Content rendering, optional action slot                                                                                                                                                                                                                                   |

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
