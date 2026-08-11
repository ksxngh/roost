# Admin & moderation

The platform-operator surface at `/admin`. Today it holds the one thing that
gates the marketplace: **verification** — turning a submitted business into a
listed one. It is deliberately small, separate from the provider app, and
invisible to everyone who is not staff.

## Platform roles

A `PlatformRole` on the user is orthogonal to the per-business `BusinessRole`.
Being an owner of your own plumbing business says nothing about platform
access, and being a platform admin says nothing about any business.

| Role    | Can                                                         |
| ------- | ---------------------------------------------------------- |
| `USER`  | Nothing admin. The default for every account.              |
| `STAFF` | **Read** the review queue and business detail. Cannot act. |
| `ADMIN` | Everything STAFF can, **plus** approve/reject/suspend.     |

`meetsPlatformRole(role, minimum)` is the single rank check (ADMIN ≥ STAFF ≥
USER); the layout, the actions, and the UI all use it, so the rule is defined
once.

### Becoming an admin

There is **no in-app path** to a platform role — by design. A compromised app
account can never escalate itself. Roles are granted out of band by someone
with database access:

```bash
npm run grant-admin -- someone@example.com          # → ADMIN
npm run grant-admin -- someone@example.com STAFF     # → STAFF
npm run grant-admin -- someone@example.com USER      # revoke
```

## The verification workflow

A business moves through statuses; only an admin decision advances it past
review. The provider submits (`DRAFT → PENDING_REVIEW`, from their storefront);
everything after that happens here.

```
DRAFT ──submit──▶ PENDING_REVIEW ──approve──▶ ACTIVE ──suspend──▶ SUSPENDED
                        │                        ▲                    │
                        └──reject──▶ DRAFT        └─────reinstate──────┘
```

Each action is defined once, in a transition table keyed by the status it may
act *from*. That is what makes the UI safe: the decision panel only shows the
buttons valid for the current status, and the service re-checks the same table,
so an action can never move a business somewhere the workflow forbids (you
cannot approve an already-active business, or suspend one still in review).

| Action    | From             | To          | Side effect                     |
| --------- | ---------------- | ----------- | ------------------------------- |
| APPROVE   | `PENDING_REVIEW` | `ACTIVE`    | Stamps `verifiedAt`; emails     |
| REJECT    | `PENDING_REVIEW` | `DRAFT`     | Emails the reason               |
| SUSPEND   | `ACTIVE`         | `SUSPENDED` | Emails the reason               |
| REINSTATE | `SUSPENDED`      | `ACTIVE`    | Keeps the original `verifiedAt` |

Reinstatement does not re-stamp `verifiedAt`: the first verification date is a
fact about when the credentials were checked, and a suspension does not undo
it.

## What each decision writes

`moderateBusiness` runs the status change, the `verifiedAt` stamp on approval,
and an **append-only audit row** in one transaction, guarded by the current
status so two admins acting at once cannot double-apply. The outcome email is
sent only **after** the transaction commits — a mail failure must never roll
back a real decision.

The audit trail (`BusinessReview`) is never updated or deleted: one row per
decision, recording the reviewer, the verb, the from/to statuses, and the
reason. The reviewer is kept even if that admin's user is later removed
(`SetNull`), because the record of what happened must outlive them. A business's
full moderation history is shown on its review page.

## Documents

Verifying a business means reading its licence and insurance. Those files are
never public; they are proxied through `/api/admin/documents/[id]`, gated on a
platform role (STAFF or ADMIN) rather than a business membership — the one
place a document crosses its business boundary. The same hardening as the
provider-facing download applies: forced `attachment`, `nosniff`, `no-store`, so
a reviewer's browser never executes an uploaded file. A non-reviewer gets a 404,
not a 403 — the route gives no signal it exists.

## Notifications

The provider hears the outcome by email: APPROVE/REINSTATE ("you're live"),
REJECT ("here's what to fix"), SUSPEND ("you've been pulled, and why"). A
business with no contact email is a silent no-op — the decision still stands in
the database. See [`moderation-mail.ts`](../src/server/notifications/moderation-mail.ts).

## Where the code lives

| Concern              | File                                                 |
| -------------------- | ---------------------------------------------------- |
| Role rank + gate     | `src/server/admin/access.ts`                         |
| Queue, detail, decisions | `src/server/admin/verification.ts`               |
| Server actions       | `src/server/admin/verification-actions.ts`           |
| Outcome email        | `src/server/notifications/moderation-mail.ts`        |
| Document proxy       | `src/app/api/admin/documents/[id]/route.ts`          |
| Admin shell + gate   | `src/app/admin/layout.tsx`                           |
| Queue / detail pages | `src/app/admin/verification/`                        |
| Decision panel (UI)  | `src/components/admin/decision-panel.tsx`            |
| Grant a role         | `scripts/grant-admin.ts`                             |

## Testing

`verification.integration.test.ts` covers the rank check, queue visibility and
ordering, each of the four transitions, the `verifiedAt` stamp-once behaviour,
the invalid-transition guard writing nothing, STAFF-vs-ADMIN enforcement, and
that every decision leaves an attributable audit row with the reason emailed.
Mail is asserted against a recording fake, so no provider is needed.
