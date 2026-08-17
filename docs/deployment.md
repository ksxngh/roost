# Deployment

How Roost ships to production. The app is one Next.js server plus one
background worker, backed by Postgres, Redis, and an object store.

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
