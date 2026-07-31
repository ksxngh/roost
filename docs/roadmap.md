# Roadmap

Each milestone ships tested, documented, and releasable before the next
begins.

| #   | Milestone        | Scope                                                                                      | Status  |
| --- | ---------------- | ------------------------------------------------------------------------------------------ | ------- |
| 1   | Foundation       | Scaffold, design system, app shell, test + CI infrastructure, docs                         | ✅ Done |
| 2   | Database & Auth  | Prisma + PostgreSQL, Better Auth (email/password + Google), verification, protected routes | ✅ Done |
| 3A  | Content pipeline | Data model, storage drivers, upload API, parsing (PDF/DOCX/PPTX/OCR) on BullMQ             | ✅ Done |
| 3B  | Library UI       | Classes/folders/tags UI and CRUD, upload experience, search, organize actions              | Next    |
| 4   | RAG & AI Chat    | Chunking, embeddings (pgvector), streaming chat with citations, grounded answers only      |         |
| 5   | Generation       | Flashcards, quizzes, summaries, guides, mnemonics, exam questions; AI credit metering      |         |
| 6   | Study Systems    | FSRS spaced repetition, quiz engine, analytics dashboard, streaks, achievements            |         |
| 7   | Billing          | Stripe subscriptions, free/premium gating, invoices, trials, coupons                       |         |
| 8   | Admin            | User/subscription management, feature flags, prompt management, moderation, support        |         |
| 9   | Hardening        | Rate limiting, security audit, WCAG pass, performance budget, load testing                 |         |
| 10  | Deploy           | Docker, CD pipeline, Sentry, PostHog, runbooks                                             |         |

## Carried-forward work

Items deliberately deferred, so they don't get lost:

- **Rate-limit storage** — a shared Redis limiter now exists
  (`src/server/rate-limit.ts`) and protects uploads, but Better Auth's own
  endpoints still use its in-memory limiter. Migrate them in Milestone 9.
  See [auth.md](auth.md#rate-limiting).
- **Storage purge job** — soft-deleted documents keep their stored objects.
  A scheduled purge belongs with the retention work in Milestone 9.
- **Streaming uploads** — the upload route buffers the file in memory, which
  is fine at 25 MB but would need streaming multipart parsing to go much
  higher. See [content-pipeline.md](content-pipeline.md#known-limitations).
- **Email verification enforcement** — verification mail is sent but sign-in
  is not blocked on it. Flip to required once a production email provider is
  configured (Milestone 10 at the latest).
- **Account deletion / privacy settings** — listed in the product spec,
  scheduled alongside subscription management in Milestone 7.

## Local environment note

Docker is not installed on this development machine. PostgreSQL 18 and
pgvector 0.8.6 run natively via Homebrew instead — see
[database.md](database.md#local-setup). CI uses a `pgvector/pgvector:pg18`
service container.
