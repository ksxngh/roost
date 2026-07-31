# StudyForge

An AI-powered study platform: upload lecture notes, PDFs, and slides, and StudyForge turns them into flashcards, quizzes, summaries, and an AI tutor that answers only from your material.

> **Status:** Milestone 1 (Foundation) complete. See [docs/roadmap.md](docs/roadmap.md) for what ships next.

## Stack

| Layer     | Choice                                           | Rationale                                                                                |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Framework | Next.js (App Router) + React + strict TypeScript | One deployable, RSC, native streaming; see [ADR-0001](docs/adr/0001-nextjs-fullstack.md) |
| Styling   | Tailwind CSS v4 + shadcn/ui                      | Token-driven theming, owned components                                                   |
| Testing   | Vitest + Testing Library                         | Fast, jsdom component + unit tests                                                       |
| Auth      | Better Auth (Milestone 2)                        | See [ADR-0002](docs/adr/0002-better-auth.md)                                             |
| Database  | PostgreSQL + Prisma + pgvector (Milestone 2+)    | See [ADR-0003](docs/adr/0003-pgvector.md)                                                |

## Getting started

```bash
npm install
cp .env.example .env.local   # defaults work for local dev
npm run dev                  # http://localhost:3000
```

## Scripts

| Script                  | Purpose                 |
| ----------------------- | ----------------------- |
| `npm run dev`           | Dev server (Turbopack)  |
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
src/
  app/            # App Router routes
    (app)/        # Authenticated app shell (dashboard, library, …)
    page.tsx      # Marketing landing page
  components/
    shell/        # App frame (sidebar, topbar, mobile drawer)
    ui/           # shadcn/ui primitives (generated, not hand-edited)
  lib/            # Config, env validation, utilities
  test/           # Test setup
docs/             # Architecture, ADRs, roadmap, testing docs
```

## Documentation

- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Testing](docs/testing.md)
- [Decision records](docs/adr/)
- [Changelog](CHANGELOG.md)

## Quality gates

CI (GitHub Actions) runs lint, format check, typecheck, tests, and a production build on every push and PR. All five must pass before merge.
