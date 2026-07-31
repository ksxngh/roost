# Architecture

## Current state (after Milestone 2)

StudyForge is a single Next.js application backed by PostgreSQL. The App
Router serves the marketing site, the auth pages, and the session-protected
app shell.

```mermaid
flowchart LR
    U[Browser]
    subgraph "Next.js"
        M["Marketing + auth pages\n(/, /login, /signup)"]
        A["Protected app\n(app) route group"]
        H["/api/auth/[...all]\nBetter Auth handler"]
    end
    DB[("PostgreSQL\nuser · session · account")]
    MAIL["Mailer\nconsole | Resend"]

    U --> M
    U --> A
    U --> H
    A -->|requireSession| DB
    H --> DB
    H --> MAIL
```

## Target architecture

The end-state the milestones build toward:

```mermaid
flowchart TB
    U[Browser] -->|HTTPS| FE["Next.js app\nRSC + route handlers"]
    FE --> AUTH["Better Auth\nsessions, OAuth"]
    FE --> DB[("PostgreSQL\n+ pgvector")]
    FE --> REDIS[("Redis\ncache + rate limits")]
    FE --> S3[("S3 / R2\nuploads")]
    FE -->|enqueue| Q["BullMQ queues"]
    W["Worker processes"] --> Q
    W --> DB
    W --> S3
    W --> AI["OpenAI / Anthropic\ngeneration + embeddings"]
    FE -->|streaming| AI
    STRIPE["Stripe"] -->|webhooks| FE
```

Key properties:

- **One web deployable.** All request/response work lives in Next.js. Heavy or
  slow work (document parsing, OCR, embedding, batch generation) is enqueued to
  BullMQ and executed by separate worker processes that share the same
  codebase and Prisma client.
- **Postgres is the source of truth** for relational data _and_ vectors
  (pgvector). Redis is disposable: cache, queues, rate-limit counters.
- **AI calls stream** from route handlers to the client; workers handle
  anything that outlives a request.

## Design system

- Tokens live in `src/app/globals.css` as CSS variables (oklch), mapped into
  Tailwind via `@theme inline`. Components never hardcode colors.
- Dark mode is the default theme (`next-themes`, class strategy); light mode
  mirrors the palette at inverted lightness. Brand hue 285 (violet) is
  reserved for primary actions; surfaces stay near-neutral.
- shadcn/ui primitives are generated into `src/components/ui/` and treated as
  owned code, but customizations belong in wrapper components, not the
  generated files.

## Server layer

`src/server/` holds framework-agnostic server code, kept out of route handlers
so it stays testable and extractable ([ADR-0001](adr/0001-nextjs-fullstack.md)):

| Module       | Responsibility                                              |
| ------------ | ----------------------------------------------------------- |
| `db.ts`      | Prisma singleton (globalThis-cached against dev HMR)        |
| `auth.ts`    | Better Auth configuration: sessions, rate limits, providers |
| `session.ts` | `getSession` (request-cached) and the `requireSession` gate |
| `mailer.ts`  | `Mailer` interface + console/Resend transports              |

Swappable dependencies are expressed as interfaces with a factory that picks
the implementation from configuration (`createMailer`). The same pattern will
carry storage (S3/R2), the vector store, and AI providers.

## Conventions

- `src/lib/env.ts` is the only place `process.env` is read on the server;
  everything else calls the validated `serverEnv()`.
- `src/lib/site-config.ts` owns product identity and navigation.
- Route groups: `(app)` wraps everything behind the (future) auth gate.
- Tests live next to the code they cover (`*.test.ts[x]`), with shared setup
  in `src/test/setup.ts`.
