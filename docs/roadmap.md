# Roadmap

Each milestone ships tested, documented, and releasable before the next
begins.

| #   | Milestone       | Scope                                                                                        | Status  |
| --- | --------------- | -------------------------------------------------------------------------------------------- | ------- |
| 1   | Foundation      | Scaffold, design system, app shell, test + CI infrastructure, docs                           | ✅ Done |
| 2   | Database & Auth | Prisma + PostgreSQL, Better Auth (email/password + Google), verification, protected routes   | Next    |
| 3   | Content Library | Classes/folders/tags CRUD, uploads to S3/R2, parsing pipeline (PDF/DOCX/PPTX/OCR) via BullMQ |         |
| 4   | RAG & AI Chat   | Chunking, embeddings (pgvector), streaming chat with citations, grounded answers only        |         |
| 5   | Generation      | Flashcards, quizzes, summaries, guides, mnemonics, exam questions; AI credit metering        |         |
| 6   | Study Systems   | FSRS spaced repetition, quiz engine, analytics dashboard, streaks, achievements              |         |
| 7   | Billing         | Stripe subscriptions, free/premium gating, invoices, trials, coupons                         |         |
| 8   | Admin           | User/subscription management, feature flags, prompt management, moderation, support          |         |
| 9   | Hardening       | Rate limiting, security audit, WCAG pass, performance budget, load testing                   |         |
| 10  | Deploy          | Docker, CD pipeline, Sentry, PostHog, runbooks                                               |         |

## Local environment note

This development machine has no Docker or PostgreSQL installed. Milestone 2
will therefore target a hosted Postgres (Neon free tier) or require
installing Postgres locally (`brew install postgresql@17 pgvector`) — decide
at milestone start.
