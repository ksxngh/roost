# Changelog

All notable changes to StudyForge are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow semver
(pre-1.0: minor = milestone).

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
