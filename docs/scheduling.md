# Services & availability

How a bookable slot comes to exist, and why the timezone handling looks the
way it does.

## The three inputs

A slot is the product of three things a provider configures:

| Input               | Where           | What it decides                        |
| ------------------- | --------------- | -------------------------------------- |
| **Service package** | `/services`     | Price, and how long a slot is          |
| **Weekly hours**    | `/availability` | Which wall-clock windows are workable  |
| **Booking rules**   | `/availability` | Timezone, notice required, how far out |

Closed days (`/availability`) subtract from the result. Everything else in
the system reads slots from `generateSlots`, never from its own arithmetic.

## Pricing

`ServicePackage.pricingModel` is `FIXED`, `HOURLY`, or `QUOTE`.

- Money is stored as **integer cents**, never a float. The form edits dollars
  and converts at the boundary, rounding rather than truncating so `19.999`
  becomes `$20.00` instead of `$19.99`.
- `priceCents` is null **only** for `QUOTE`. The schema rejects a priced model
  with no number, because a missing price renders as `$0` — which reads as
  free.
- `durationMinutes` is required even for quote-priced work: without a length
  there is no slot to offer.
- `bufferMinutes` is travel or clean-up time reserved after the job. It is not
  bookable and must fit inside the working day, so a 1-hour service with a
  30-minute buffer stops being offered at 3:30pm on a day that closes at 5.

## Timezones

Opening hours are **wall-clock times** ("we open at 8"). A booking is an
**instant**. `src/lib/time.ts` converts between them using
`Intl.DateTimeFormat` as the timezone database — no hardcoded offsets, and no
dependency. (`Temporal` would make the module unnecessary, but it is not
available in Node 24.)

Three consequences worth knowing:

- **9am stays 9am across a daylight-saving change.** The instant moves; the
  wall time does not.
- **Times the clock skips do not become slots.** On the spring-forward
  morning, `wallTimeToInstant` returns `null` for 02:00–02:59, and slot
  generation drops them rather than shifting a booking to an hour that never
  happens.
- **A repeated hour is offered once.** On the fall-back morning 01:30 occurs
  twice; the earlier instant is used, which is what a customer reading
  "1:30 AM" expects.

Calendar arithmetic (`addDays`, `weekdayOf`) is done in UTC on purpose, so a
day never gets skipped or doubled by an offset change. Closed days are stored
as `@db.Date` at UTC midnight — a label, not an instant.

## Slot generation

`generateSlots` in `src/server/businesses/availability.ts` is pure and takes
no database. That is deliberate: a wrong answer here books someone at a time
their provider is not working, so the rules are exhaustively testable in
isolation.

Rules, applied in order, for each day in the horizon:

1. A day marked closed produces nothing.
2. A slot must fit entirely inside one opening window, buffer included.
3. Wall-clock times erased by a daylight-saving jump are dropped.
4. Anything sooner than the business's notice period is not offered.

Slot starts are aligned to a 15-minute grid (`SLOT_STEP_MINUTES`), and a day
with split shifts is returned as one ascending list.

The horizon is clamped three ways — the caller's request, the business's own
`bookingHorizonDays`, and a hard `MAX_AVAILABILITY_DAYS` of 60 — so no
request can ask the server to compute a year of slots.

## Reading availability

| Function              | Caller              | Guard                                     |
| --------------------- | ------------------- | ----------------------------------------- |
| `previewAvailability` | the business itself | membership; package must be its own       |
| `publicAvailability`  | the marketplace     | `status: ACTIVE` **and** `active` package |

`publicAvailability` is keyed by **slug**, not by an internal id, so the
marketplace never needs a business's primary key and `getPublicStorefront`
can keep `id` out of its payload.

The `/availability` preview renders slots computed by the server and
formatted in the business's timezone — not the browser's. A preview that did
its own arithmetic could reassure a provider about a schedule that isn't
real.

## Deliberate limits

- **One window per day in the editor.** The schema stores split shifts and
  `generateSlots` honours them, but the editor shows a single open/close pair.
  Saving that form flattens a split shift to its outer bounds; this is
  documented in the component and covered by a test.
- **Whole-day closures only.** A half-day off means editing that weekday's
  hours for now.
- **No bookings yet.** Slots are computed from hours minus closures. Once jobs
  exist (Milestone 6), booked time subtracts from availability too — that
  subtraction is the one rule this module does not yet apply.
