# Roadmap

Roost is a home-services marketplace plus the operations software the
providers on it run their business with. Two audiences, one system.

Each milestone ships tested, documented, and releasable before the next
begins.

| #   | Milestone                        | Scope                                                                         | Status  |
| --- | -------------------------------- | ----------------------------------------------------------------------------- | ------- |
| 1   | Pivot & core domain              | Businesses, team seats, trades, service areas; rebrand; provider shell        | ✅ Done |
| 2   | Provider onboarding & storefront | Business profile, coverage areas, licence/insurance upload, public storefront | ✅ Done |
| 3   | Service packages & availability  | Fixed-price packages, business hours, real bookable slots                     | ✅ Done |
| 4   | Marketplace & booking            | City/category search, listings, slot selection, booking creation              | ✅ Done |
| 5   | Payments                         | Stripe Connect onboarding, checkout, platform fee, payouts                    | ✅ Done |
| 6   | Jobs & scheduling ops            | Calendar view, job assignment, day sheets, background worker                  | ✅ Done |
| 7   | Quotes & invoicing               | Estimate → approval → invoice → payment                                       | ✅ Done |
| 8   | Client CRM                       | Auto-built client list, history, notes, addresses                             | ✅ Done |
| 9   | Teams & permissions              | Invites, seats, granular permissions                                          | Next    |
| 10  | Subscriptions                    | Pro/Premium tiers, feature gating, billing                                    |         |
| 11  | Admin, hardening, deploy         | Moderation, verification queue, rate limits, WCAG, CD                         |         |

Milestones 4 and 5 are where the marketplace becomes real — everything
before them exists to make sure there is something worth booking.

## Sequencing note

The marketplace is a two-sided cold start: providers need customers and
customers need providers. The operations software has no such problem — a
solo cleaner gets value from scheduling and invoicing on day one with nobody
else on the platform. Milestones 2, 3, 6, 7, and 8 are therefore useful to a
provider even before the marketplace has demand, which is deliberate.

## Carried-forward work

Deliberately deferred, tracked so it doesn't get lost:

- **Rate-limit storage** — a shared Redis limiter exists
  (`src/server/rate-limit.ts`); Better Auth's own endpoints still use its
  in-memory limiter. Migrate in Milestone 11.
- **Email verification enforcement** — verification mail is sent but sign-in
  is not blocked on it. Flip once a production email provider is configured.
- **Storage purge job** — soft-deleted records keep their stored objects.
- **Verification review** — `submitForReview` sets `PENDING_REVIEW`; nothing
  can set `ACTIVE` yet. The admin queue that approves, rejects, and suspends
  businesses lands in Milestone 11; until then status changes are manual.
- **Business switcher** — `currentMembership` returns the oldest membership.
  A user belonging to several businesses needs an explicit switcher
  (Milestone 9).
- **Document expiry** — `expiresAt` is stored but nothing acts on it. Expiry
  reminders and auto-suspension need the worker (Milestone 5).
- **Customers cannot cancel their own booking** — only the business can, from
  `/schedule`. A customer-side cancel needs a policy (how late is too late)
  and, once money moves, a refund path — so it lands with payments.
- **No accept/decline mail** — the customer is mailed on request and 24 hours
  before the job, but nothing tells them the moment a business accepts or
  declines. The worker now exists, so this is small.
- **Live Stripe keys** — everything is built and tested against a fake
  gateway plus real signature verification. Switching payments on needs
  Stripe keys, which only the account holder can create; see
  [payments.md](payments.md#setting-it-up).
- **Split shifts have no editor** — the schema and slot generator support
  several windows per day, but the hours form edits one open/close pair and
  flattens anything else on save.

## Local environment

Docker is not installed on this machine. PostgreSQL 18 and Redis run natively
via Homebrew — see [database.md](database.md#local-setup). CI uses
`pgvector/pgvector:pg18` and `redis:8-alpine` service containers.
