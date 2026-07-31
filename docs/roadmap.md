# Roadmap

Each milestone ships tested, documented, and releasable before the next
begins.

| #   | Milestone       | Scope                                                                                        | Status  |
| --- | --------------- | -------------------------------------------------------------------------------------------- | ------- |
| 1   | Foundation      | Scaffold, design system, app shell, test + CI infrastructure, docs                           | ✅ Done |
| 2   | Database & Auth | Prisma + PostgreSQL, Better Auth (email/password + Google), verification, protected routes   | ✅ Done |
| 3   | Content Library | Classes/folders/tags CRUD, uploads to S3/R2, parsing pipeline (PDF/DOCX/PPTX/OCR) via BullMQ | Next    |
| 4   | RAG & AI Chat   | Chunking, embeddings (pgvector), streaming chat with citations, grounded answers only        |         |
| 5   | Generation      | Flashcards, quizzes, summaries, guides, mnemonics, exam questions; AI credit metering        |         |
| 6   | Study Systems   | FSRS spaced repetition, quiz engine, analytics dashboard, streaks, achievements              |         |
| 7   | Billing         | Stripe subscriptions, free/premium gating, invoices, trials, coupons                         |         |
| 8   | Admin           | User/subscription management, feature flags, prompt management, moderation, support          |         |
| 9   | Hardening       | Rate limiting, security audit, WCAG pass, performance budget, load testing                   |         |
| 10  | Deploy          | Docker, CD pipeline, Sentry, PostHog, runbooks                                               |         |

## Carried-forward work

Items deliberately deferred, so they don't get lost:

- **Rate-limit storage** — Better Auth's limiter currently counts in memory,
  so limits are per-instance. Move to Redis secondary storage in Milestone 3
  when Redis arrives. See [auth.md](auth.md#rate-limiting).
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
