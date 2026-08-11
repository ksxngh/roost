# Subscriptions

How Roost earns its own revenue: providers pay a monthly or annual
subscription for a plan tier. This is separate from
[payments](payments.md) (money for a booking, via Stripe Connect) and from
[quotes & invoicing](billing.md) (a provider billing their client). Here Roost
is the merchant and the provider is the customer, billed through **Stripe
Billing**.

## Plans

The two tiers and their prices live in one place — [`src/lib/plans.ts`](../src/lib/plans.ts) —
and are rendered on the public [pricing page](pricing.md):

| Tier      | Price (monthly) | Seats | Notes                          |
| --------- | --------------- | ----- | ------------------------------ |
| `PRO`     | $129.99 CAD     | 1     | Solo operator                  |
| `PREMIUM` | $214.99 CAD     | 8     | Teams; Roost-sent work (soon)  |

Annual billing charges ten months for twelve (the "pay for 10, get 12" line on
the pricing page). `seatLimit(tier)` is the single source of truth for the seat
cap that [team management](teams.md) enforces.

## The Stripe pieces

Subscriptions reuse the same Stripe secret key as Connect payments but a
different set of objects:

- A **Customer** per business (`Subscription.stripeCustomerId`, unique).
  Created on first checkout via `ensureCustomer` and reused forever after —
  persisted immediately so an abandoned checkout never orphans a second
  customer.
- A **Checkout Session** in `subscription` mode, carrying
  `metadata.businessId` and `metadata.tier` on the subscription it creates.
- The **Billing Portal**, where an owner updates the card or cancels.

### Configuration

Four price IDs gate the feature (`src/lib/env.ts`):

```
STRIPE_PRICE_PRO_MONTHLY      STRIPE_PRICE_PRO_ANNUAL
STRIPE_PRICE_PREMIUM_MONTHLY  STRIPE_PRICE_PREMIUM_ANNUAL
```

`subscriptionsConfigured(env)` is true when both **monthly** prices are set
(annual is optional). The billing page checks this together with
`paymentsConfigured()` and, when either is missing, renders a read-only
"billing isn't available on this deployment yet" state instead of a broken
checkout button. Nothing throws; the app degrades gracefully. See
[`src/server/billing/prices.ts`](../src/server/billing/prices.ts) for the
price ↔ tier mapping (`priceIdFor`, `refForPriceId`).

## Who can do what

Viewing the billing panel is open to any member — everyone should see which
plan they're on and whether the team is over its seat limit. **Changing** the
subscription (starting checkout, opening the portal) is **owner-only**: the
subscription is the business's money. This is stricter than the `BILLING`
capability, which governs client-facing invoicing, not the platform bill.

## Plan changes and the downgrade guard

Checkout is the single entry point for a plan change, so the seat guard lives
there: `startSubscriptionCheckout` refuses a downgrade
(`DowngradeBlockedError`) when the team already has more members than the
target tier's seats — e.g. a 3-person team cannot switch to Pro (1 seat) until
it removes members. The Stripe billing portal is deliberately configured for
**cancellation and payment method only**, never plan switching, so it can't be
used to sidestep this check.

## State: entitlement vs. record

Two fields track a subscription, and they mean different things:

- `Subscription` (the row) — the cached mirror of Stripe: `tier`, `status`,
  `currentPeriodEnd`, `cancelAtPeriodEnd`.
- `Business.plan` — the **effective** entitlement the rest of the app reads
  (seat limits, feature gates).

`effectivePlan(status, tier)` derives the second from the first: the subscribed
tier while the subscription is **paying** (`ACTIVE`, `TRIALING`, or `PAST_DUE`
— Stripe is still retrying), otherwise `DEFAULT_PLAN`. Keeping access during
`PAST_DUE` avoids yanking features the moment a card retry blips; a true
`CANCELED` reverts to the default.

`DEFAULT_PLAN` is `PREMIUM` **during the pre-billing phase**: nobody is charged
yet, so granting the full tier is the correct launch posture. Going live means
changing this to a restricted default (or requiring checkout at onboarding) —
it is the one line to flip.

## The webhook path

State is only ever written from Stripe's **verified** webhook — never
optimistically from the checkout redirect. The success URL just returns the
owner to the billing page; entitlement waits for the event. Handled events:

- `checkout.session.completed` (subscription mode) — acknowledged; the
  subscription's own events do the work.
- `customer.subscription.created` / `updated` → `applyStripeSubscription`,
  which upserts the `Subscription` row and sets `Business.plan` in one
  transaction.
- `customer.subscription.deleted` → `cancelStripeSubscription`, which marks the
  row `CANCELED` and reverts the plan.

Every event is signature-verified and deduplicated by a primary-key insert of
its Stripe event id (see [payments](payments.md#webhooks)), so a redelivered
event is a no-op.

### Anti-spoofing

`applyStripeSubscription` trusts `metadata.businessId` only after confirming the
business exists **and** already owns the customer id on the event (or has no
customer yet). Without that check, a forged `businessId` in metadata could point
a real Stripe subscription at another business's plan. The tier resolves from
`metadata.tier`, falling back to the price id if metadata is ever absent; an
event that names no known tier is ignored.

## Where the code lives

| Concern                    | File                                                |
| -------------------------- | --------------------------------------------------- |
| Plan tiers, prices, seats  | `src/lib/plans.ts`                                  |
| Price ↔ tier mapping       | `src/server/billing/prices.ts`                      |
| Subscription service       | `src/server/billing/subscription.ts`                |
| Server actions             | `src/server/billing/subscription-actions.ts`        |
| Stripe calls (interface)   | `src/server/payments/stripe.ts`                     |
| Webhook dispatch           | `src/server/payments/webhook.ts`                    |
| Billing UI                 | `src/components/billing/billing-panel.tsx`          |
| Billing page               | `src/app/(app)/settings/billing/page.tsx`           |

## Testing

All Stripe calls sit behind the `StripeGateway` interface and are tested
against an in-memory fake — no live keys needed. Coverage includes the customer
reuse path, the downgrade guard, owner-only enforcement, the
paying-vs-cancelled entitlement mapping, and the webhook's customer-ownership
guard against spoofed metadata. See `src/server/billing/*.test.ts` and
`subscription.integration.test.ts`.

Running live against Stripe requires real test-mode price IDs and a webhook
signing secret, which a deployer supplies; the suite does not need them.
