# Roost

A home-services marketplace and the operations software the providers on it
run their business with. Homeowners find a licensed, insured pro and book
them; the pro gets scheduling, quotes, invoicing, and a client list in the
same account.

> **Status:** Milestone 6 complete — week calendar, day sheets, job
> assignment, and a background worker sending reminders. Milestone 7 adds
> quotes and invoicing. See [docs/roadmap.md](docs/roadmap.md).

## Stack

| Layer     | Choice                                           | Rationale                                                                                |
| --------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Framework | Next.js (App Router) + React + strict TypeScript | One deployable, RSC, native streaming; see [ADR-0001](docs/adr/0001-nextjs-fullstack.md) |
| Styling   | Tailwind CSS v4 + shadcn/ui                      | Token-driven theming, owned components                                                   |
| Testing   | Vitest + Testing Library                         | Fast jsdom component tests, node integration tests against a real database               |
| Auth      | Better Auth                                      | See [ADR-0002](docs/adr/0002-better-auth.md)                                             |
| Database  | PostgreSQL 18 + Prisma 7                         | See [ADR-0003](docs/adr/0003-pgvector.md)                                                |
| Storage   | Local filesystem or S3-compatible                | Same interface both ways; no cloud account needed in development                         |

## Getting started

Requires Node 24, PostgreSQL 18, and Redis.

```bash
brew install postgresql@18 redis
brew services start postgresql@18 && brew services start redis
createdb roost && createdb roost_test
```

```bash
npm install
cp .env.example .env
openssl rand -base64 32          # paste into BETTER_AUTH_SECRET
npx prisma migrate dev
npm run seed                     # loads the service categories
npm run dev                      # http://localhost:3000
```

Sign up at `/signup`. With no email provider configured, the verification
link prints to the server log — copy it from the terminal.

A new account is redirected to `/onboarding` to create its business, then to
`/storefront`. Storefronts start in `DRAFT` and only become publicly visible
once an admin marks them `ACTIVE` — see
[docs/storefront.md](docs/storefront.md) for the full lifecycle and how to
promote one locally.

## Scripts

| Script                  | Purpose                 |
| ----------------------- | ----------------------- |
| `npm run dev`           | Dev server (Turbopack)  |
| `npm run seed`          | Seed service categories |
| `npm run worker`        | Background sweeps       |
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
prisma/           # Schema, migrations, seed
src/
  app/            # App Router routes
    (app)/        # Session-protected provider app (dashboard, services, …)
    (auth)/       # Login, signup, password reset
    api/auth/     # Better Auth HTTP handler
    api/documents/# Verification-document upload and download
    api/stripe/   # Signed Stripe webhook
    booking/      # Customer's booking confirmation, by reference
    browse/       # Public marketplace search
    pro/[slug]/   # Public storefront and booking flow
    onboarding/   # Business creation
    page.tsx      # Marketing landing page
  components/
    auth/         # Auth forms and fields
    availability/ # Weekly hours, closures, booking rules, slot preview
    booking/      # Customer slot picker and details form
    payments/     # Stripe Connect status card
    schedule/     # Calendar, day sheet, booking list, assignment
    services/     # Service package editor
    onboarding/   # Business creation form
    shell/        # App frame (sidebar, topbar, user menu)
    storefront/   # Profile, service areas, documents, submit for review
    ui/           # shadcn/ui primitives (generated, not hand-edited)
  lib/            # Config, env validation, validation schemas, utilities
  server/         # Framework-agnostic server code
    businesses/   # Access, business, packages, availability, bookings, documents
    notifications/# Booking mail
    payments/     # Stripe gateway, Connect, checkout, webhook handling
    queue/        # Redis connection and BullMQ queues
    storage/      # Storage interface + local/S3 drivers
  worker/         # Background worker entry point
  test/           # Test setup and global setup
docs/             # Architecture, ADRs, roadmap, auth, database, storefront, testing
```

## Documentation

- [Architecture](docs/architecture.md)
- [Authentication](docs/auth.md)
- [Database](docs/database.md)
- [Providers & storefronts](docs/storefront.md)
- [Services & availability](docs/scheduling.md)
- [Booking](docs/booking.md)
- [Payments](docs/payments.md)
- [Running the work](docs/operations.md)
- [Roadmap](docs/roadmap.md)
- [Testing](docs/testing.md)
- [Decision records](docs/adr/)
- [Changelog](CHANGELOG.md)

## Quality gates

CI (GitHub Actions) runs lint, format check, typecheck, tests, and a production build on every push and PR. All five must pass before merge.
