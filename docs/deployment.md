# Deployment

How Roost ships to production. There are two supported shapes:

- **Container** (any Docker host, Fly.io, Render, Kubernetes) — a long-running
  web server plus a long-running worker. Covered by the sections below.
- **Vercel** (serverless) — the web app runs as functions and the two sweeps
  run as **Vercel Cron** instead of a worker. See
  [Deploying to Vercel](#deploying-to-vercel).

The app is one Next.js server plus one background worker, backed by Postgres,
Redis, and an object store.

## What runs

| Process    | Command          | Scales | Notes                                 |
| ---------- | ---------------- | ------ | ------------------------------------- |
| **web**    | `node server.js` | 1..n   | The Next.js standalone server         |
| **worker** | `npm run worker` | 1      | BullMQ jobs: reminders, expiry sweeps |

The worker is a separate process on purpose: its work outlives any request, so
a web instance recycling mid-sweep must not lose it. Run **exactly one** worker
— the schedules it installs are idempotent, but a second worker just doubles
polling.

## Backing services

| Service        | Required                   | Configured by                     |
| -------------- | -------------------------- | --------------------------------- |
| PostgreSQL 18  | yes                        | `DATABASE_URL`                    |
| Redis          | yes                        | `REDIS_URL`                       |
| Object store   | for uploads                | S3-compatible vars, or local disk |
| Stripe         | for payments/subscriptions | `STRIPE_*`                        |
| Email (Resend) | for real mail              | `RESEND_API_KEY`, `EMAIL_FROM`    |

`btree_gist` must be available in Postgres for the booking no-overlap
constraint; the `pgvector/pgvector:pg18` image used in CI and compose has it. In
production, point `DATABASE_URL` and `REDIS_URL` at managed services.

## Health checks

Two endpoints, for two different questions:

- **`GET /api/health`** — liveness. Returns `200` whenever the process can
  respond; checks nothing external. Wire this to the probe that **restarts** a
  container.
- **`GET /api/ready`** — readiness. Pings Postgres and Redis and returns `503`
  if either is down, naming the failed dependency. Wire this to the probe that
  decides whether to **route traffic** to an instance. Never use it as the
  liveness probe, or a brief database blip would restart every instance.

## Images

The [`Dockerfile`](../Dockerfile) produces two images from one build, selected
by target:

```bash
docker build --target web    -t roost-web    .
docker build --target worker -t roost-worker .
```

The `web` target ships Next.js standalone output — a traced, pruned runtime run
as a non-root user, with a built-in liveness `HEALTHCHECK`. The `worker` target
carries the source, dependencies, and the Prisma schema, so the **same image**
also runs migrations (below). CI publishes both to GHCR on every green build of
`main` and on `v*` tags (see [`.github/workflows/cd.yml`](../.github/workflows/cd.yml)).

> Build-time note: `next build` evaluates server modules that require
> `DATABASE_URL` and `BETTER_AUTH_SECRET`, so the builder stage sets throwaway
> placeholders. The real secrets are injected at **runtime** and are never
> baked into the image.

## Migrations

Never run `prisma migrate dev` in production (it can rewrite history and is
refused for non-interactive use). Apply the committed migrations with:

```bash
npx prisma migrate deploy
```

Run it as a **release step before** web and worker start, so they never serve
against an out-of-date schema. The worker image contains the schema and CLI for
exactly this; `docker-compose.yml` wires it as a one-shot `migrate` service that
web and worker `depend_on` with `condition: service_completed_successfully`.

## Self-hosting the whole stack

[`docker-compose.yml`](../docker-compose.yml) brings up Postgres, Redis, the
migration step, web, and worker together:

```bash
cp .env.example .env      # fill in real secrets; never commit it
docker compose up --build
```

For a managed deployment, drop the `postgres`/`redis` services and point
`DATABASE_URL`/`REDIS_URL` at the managed endpoints.

## Deploying to Vercel

Vercel is serverless, so there is **no long-running worker**. Instead, the two
sweeps run as **Vercel Cron** jobs that hit secured routes — the sweeps are
stateless and re-derive their work from the database, so a fixed schedule needs
no queue:

| Route                         | Schedule (`vercel.json`) | Replaces worker job |
| ----------------------------- | ------------------------ | ------------------- |
| `/api/cron/booking-reminders` | daily 13:00 UTC          | `booking-reminders` |
| `/api/cron/document-expiry`   | daily 08:00 UTC          | `document-expiry`   |

Both schedules default to **once daily**, which runs on the free Hobby plan —
Vercel Cron on Hobby is capped at one run per day. This is safe: both sweeps
are idempotent (a booking is only reminded once, gated on `reminderSentAt`),
so a daily run just means less fine-grained timing than the worker's 15-minute
sweep, not a missed or duplicate reminder. On a **Pro** plan you can tighten
`booking-reminders` back to hourly (`0 * * * *`) or finer for reminders closer
to the moment they're due.

Both routes require `Authorization: Bearer $CRON_SECRET`, which Vercel Cron
sends automatically once `CRON_SECRET` is set. Without the secret the routes
fail closed in production.

Nothing in the request path enqueues BullMQ work, so **Redis is optional** on
Vercel — it is used only for auth rate limiting, which fails open if absent.
For real protection, still point `REDIS_URL` at a managed Redis (e.g. Upstash,
`rediss://…`).

### Steps

1. **Provision managed Postgres** with the `btree_gist` extension (Vercel
   Postgres / Neon both support it). Enable it once: `CREATE EXTENSION IF NOT
EXISTS btree_gist;`
2. **Provision managed Redis** (Upstash) and note its `rediss://` URL.
3. **Import the Git repo** into Vercel (or `vercel deploy` from the CLI).
4. Set the **build command** to run migrations first:
   `npx prisma migrate deploy && next build`.
5. Set **environment variables** (Project → Settings → Environment Variables):
   `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`
   (your Vercel URL or custom domain), `CRON_SECRET` (`openssl rand -hex 32`),
   and Stripe/email/S3 vars as needed.
6. **Deploy.** `vercel.json` registers the cron jobs automatically.
7. After the first deploy, run the one-time seed against the production DB
   (`npm run seed` with `DATABASE_URL` pointing at it) and grant yourself admin
   (`npm run grant-admin -- you@example.com`).
8. Confirm `GET /api/ready` returns `200`, then trigger
   `GET /api/cron/booking-reminders` once with the Bearer token to smoke-test.

`output: "standalone"` is skipped automatically on Vercel (detected via the
`VERCEL` env var), so the platform uses its own build output.

## Required environment

Generate a strong auth secret:

```bash
openssl rand -base64 32   # → BETTER_AUTH_SECRET
```

At minimum production needs `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`,
and the app's public URL. Payments, subscriptions, email, and S3 storage each
switch on only when their variables are present — the app degrades gracefully
without them (for example, `/settings/billing` shows a read-only "not available"
state without Stripe price IDs). See [`.env.example`](../.env.example) for the
full list.

## First-run checklist

1. Provision Postgres 18 (with `btree_gist`) and Redis; set their URLs.
2. Set `BETTER_AUTH_SECRET` and the site URL; add Stripe/email/S3 as needed.
3. Run `npx prisma migrate deploy`.
4. Run `npm run seed` once to load the service categories.
5. Start web and exactly one worker.
6. Grant yourself admin: `npm run grant-admin -- you@example.com` (see
   [admin.md](admin.md)).
7. Confirm `GET /api/ready` returns `200` from the load balancer's vantage.

## Not yet automated

Deploying the published image to a specific host (the final `kubectl`/`flyctl`/
platform step) is intentionally left out — it belongs to whichever platform runs
the containers. The image build, health probes, and migration flow above are the
platform-agnostic parts. End-to-end smoke tests (Playwright) against a deployed
environment are deferred with the rest of E2E (see [testing.md](testing.md)).
