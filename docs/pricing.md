# Plans & pricing

What Roost charges providers, and why those numbers.

## The numbers

|                 | Roost Pro                     | Roost Premium   |
| --------------- | ----------------------------- | --------------- |
| Monthly         | **$129.99 CAD**               | **$214.99 CAD** |
| Annual          | $1,299.90 (10 months, get 12) | $2,149.90       |
| Seats           | 1                             | up to 8         |
| Marketplace fee | 8%                            | 8%              |

Plus Stripe's own 2.9% + 30¢ per card payment, billed by Stripe rather than
by us — the money never passes through a Roost account
([payments.md](payments.md)).

## Positioning

Benchmarked against Padpal, checked at padpal.com/pricing on 4 August 2026:
**$144.99** Pro, **$229.99** Premium, **9%** marketplace fee.

Roost undercuts each tier by **$15.00/month** and takes **8%** rather than 9%.

The take rate matters as much as the sticker price. Undercutting the
subscription by $15 while charging a *higher* percentage would lose the
comparison on exactly the jobs worth winning: at 9% versus 8%, a business
doing $4,000/month of marketplace work pays $40 more in fees than it saves on
subscription. Being cheaper has to mean cheaper in total.

## One source of truth

`src/lib/plans.ts` holds prices, seat counts, and the feature grid. The
pricing page renders from it; nothing hardcodes a number in JSX.

The fee is the sharp edge: the pricing page reads `MARKETPLACE_FEE_BPS` from
`plans.ts`, while checkout reads `PLATFORM_FEE_BPS` from the environment. If
those drift, providers are billed a rate they were never shown. A test
asserts they agree, and the env default is set to match.

## Advertising what does not exist yet

Every row in the comparison carries a status: `live` or `soon`. Anything not
built renders a **Soon** badge instead of a tick, and the page says plainly
that those features are not available.

This is deliberate. A pricing page is the one surface where an overstatement
is a promise, and no amount of testing catches a tick next to a feature that
does not work. Two rows — guaranteed bookings and Roost-funded advertising —
are pure demand-generation promises with no implementation at all; they are
marked accordingly rather than quietly ticked because a competitor ticks
them.

A test lists the unbuilt features by name and fails if any of them is ever
marked `live`. When a milestone ships, that list is the thing to update.

## Not yet

- **Nothing is charged.** There is no subscription billing, no plan stored
  against a business, and no seat enforcement — `Premium`'s eight seats are a
  published intention, not a limit the code applies. That is Milestone 10.
- **No annual checkout.** The annual price is quoted; only monthly is
  described in the flow.
- **No trial.** Padpal does not advertise one either, but it is the obvious
  next lever if signup conversion is weak.
