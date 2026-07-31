# StudyForge

An AI-powered study platform: upload lecture notes, PDFs, and slides, and StudyForge turns them into flashcards, quizzes, summaries, and an AI tutor that answers only from your material.

> **Status:** Milestone 3A (content pipeline) complete — uploads, parsing, and
> background processing work end to end. The library UI lands in 3B. See
> [docs/roadmap.md](docs/roadmap.md).

## Stack

| Layer     | Choice                                           | Rationale                                                                                |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Framework | Next.js (App Router) + React + strict TypeScript | One deployable, RSC, native streaming; see [ADR-0001](docs/adr/0001-nextjs-fullstack.md) |
| Styling   | Tailwind CSS v4 + shadcn/ui                      | Token-driven theming, owned components                                                   |
| Testing   | Vitest + Testing Library                         | Fast, jsdom component + unit tests                                                       |
| Auth      | Better Auth                                      | See [ADR-0002](docs/adr/0002-better-auth.md)                                             |
| Database  | PostgreSQL 18 + Prisma 7 (+ pgvector, M4)        | See [ADR-0003](docs/adr/0003-pgvector.md)                                                |

## Getting started

Requires Node 24, PostgreSQL 18 with pgvector, and Redis.

```bash
brew install pgvector postgresql@18 redis
brew services start postgresql@18 && brew services start redis
createdb studyforge && createdb studyforge_test
```

```bash
npm install
cp .env.example .env
openssl rand -base64 32          # paste into BETTER_AUTH_SECRET
npx prisma migrate dev
npm run dev                      # http://localhost:3000
npm run worker                   # in a second terminal — processes uploads
```

Sign up at `/signup`. With no email provider configured, the verification
link prints to the server log — copy it from the terminal.

## Scripts

| Script                  | Purpose                 |
| ----------------------- | ----------------------- |
| `npm run dev`           | Dev server (Turbopack)  |
| `npm run worker`        | Background job worker   |
| `npm run build`         | Production build        |
| `npm run test`          | Run the test suite once |
| `npm run test:watch`    | Watch mode              |
| `npm run test:coverage` | Coverage report         |
| `npm run lint`          | ESLint                  |
| `npm run typecheck`     | `tsc --noEmit`          |
| `npm run format`        | Prettier write          |
| `npm run format:check`  | Prettier check (CI)     |

## Project layout

```
prisma/           # Schema + migrations
src/
  app/            # App Router routes
    (app)/        # Session-protected app (dashboard, library, …)
    (auth)/       # Login, signup, password reset
    api/auth/     # Better Auth HTTP handler
    page.tsx      # Marketing landing page
  components/
    auth/         # Auth forms and fields
    shell/        # App frame (sidebar, topbar, user menu)
    ui/           # shadcn/ui primitives (generated, not hand-edited)
  lib/            # Config, env validation, validation schemas, utilities
  server/         # Framework-agnostic server code
    documents/    # Upload validation, upload service, processing
    parsing/      # PDF, DOCX, PPTX, text, and OCR extraction
    queue/        # Redis connection and BullMQ queues
    storage/      # Storage interface + local/S3 drivers
  worker/         # Background job worker entry point
  test/           # Test setup and global setup
docs/             # Architecture, ADRs, roadmap, auth, database, testing
```

## Documentation

- [Architecture](docs/architecture.md)
- [Authentication](docs/auth.md)
- [Content pipeline](docs/content-pipeline.md)
- [Database](docs/database.md)
- [Roadmap](docs/roadmap.md)
- [Testing](docs/testing.md)
- [Decision records](docs/adr/)
- [Changelog](CHANGELOG.md)

## Quality gates

CI (GitHub Actions) runs lint, format check, typecheck, tests, and a production build on every push and PR. All five must pass before merge.
