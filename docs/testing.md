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
`studyforge_test` and runs `prisma migrate deploy` once per invocation, so
tests exercise the same migration chain that ships. Files are named
`*.integration.test.ts` and start with `// @vitest-environment node`.

Integration tests truncate tables between cases and assert the database name
contains `studyforge_test` before any destructive operation — a guard against
ever pointing the suite at a real database.

Test files run **sequentially** (`fileParallelism: false`): integration files
share one database and truncate tables between cases, so parallel files would
delete each other's fixtures. The suite runs in about nine seconds, so the
cost is negligible. Vitest projects separate the jsdom (`unit`) and node
(`integration`) environments.

CI runs the same suite against `pgvector/pgvector:pg18` and `redis:8-alpine`
service containers via `TEST_DATABASE_URL` and `REDIS_URL`.

## Current suite (164 tests)

| Area                          | Coverage                                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/env`                     | Required vars, defaults, malformed URLs, wrong schemes, short secret, unknown NODE_ENV                                                                                                                      |
| `lib/utils` (`cn`)            | Merging, falsy handling, tailwind conflicts, empty input                                                                                                                                                    |
| `lib/site-config`             | Metadata presence, duplicate hrefs, href/segment consistency                                                                                                                                                |
| `lib/validations/auth`        | Password policy bounds, email formats, name trimming, login-vs-signup asymmetry                                                                                                                             |
| `server/mailer`               | Transport selection, console output, Resend request shape, API + network failures                                                                                                                           |
| `server/auth` _(integration)_ | Signup, password hashing, duplicate email, weak password, sign-in success/failure, session resolution, sign-out revocation, garbage tokens, per-IP rate limiting, reset-token issuance, no user enumeration |
| `SidebarNav`                  | Landmark + links, aria-current on active/nested/unknown routes, empty list, onNavigate                                                                                                                      |
| `ThemeToggle`                 | Accessible trigger, menu options, setTheme wiring                                                                                                                                                           |
| `EmptyState`                  | Content rendering, optional action slot                                                                                                                                                                     |
| `storage/local-storage`       | Round-trip, binary safety, atomic overwrite, missing keys, no temp-file leakage, path-traversal rejection (traversal, absolute, backslash, null byte)                                                       |
| `documents/validate-upload`   | Title sanitization (path components, control chars, unicode), storage-key generation, size/extension limits, content-mismatch rejection of disguised executables, images, and binary-as-text                |
| `parsing/*`                   | Text normalization, paragraph-safe pagination with no content loss, PPTX slide extraction and entity decoding, numeric slide ordering, corrupt/empty handling, parser dispatch                              |
| `documents` _(integration)_   | Upload → storage → row → parse, per-user duplicate rules, cross-user IDOR rejection for classes and folders, idempotent reprocessing, actionable failure messages, cascade deletes                          |
| `queue` _(integration)_       | Real BullMQ delivery, job-id dedupe, retry/backoff, job-id format guard                                                                                                                                     |
| `rate-limit` _(integration)_  | Limit enforcement, remaining counts, per-key isolation, TTL, window rollover                                                                                                                                |

Playwright E2E arrives with Milestone 3B, once the library UI makes the
upload → parse → study flow drivable in a real browser.
