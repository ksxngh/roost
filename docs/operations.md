# Running the work

The provider's side of a booked job: seeing it, assigning it, and being
reminded about it.

## Views

`/schedule` has three, chosen by query string so each is linkable:

| View                       | For                                                    |
| -------------------------- | ------------------------------------------------------ |
| `?view=calendar` (default) | Eight days at a glance                                 |
| `?view=today`              | The day sheet — what's happening now, in order         |
| `?view=list`               | Requests waiting on a reply, then everything confirmed |

The calendar is **not** an hour grid. Home-services days are sparse, and a
grid spends most of its pixels rendering empty 3am rows; jobs are listed per
day in time order, which is what a provider actually scans for. Declined and
cancelled work is hidden from the calendar and the day sheet — the day sheet
is a run order, not a history — and remains in the list view.

Every time is formatted **server-side in the business's timezone**, so a
provider checking their phone in another province still reads their own
working hours.

## Assignment

A booking can be given to a `BusinessMember`. The picker only appears when
there are at least two seats: a solo operator has nothing to choose between.

The seat must belong to the same business. Assigning work to another
business's employee would put a customer's address on a stranger's schedule,
so `assignBooking` verifies the seat before writing and treats a foreign id
as not-found. Deleting a seat sets its bookings back to unassigned rather
than deleting the work (`onDelete: SetNull`).

`internalNote` is text the customer never sees — parking, equipment,
warnings. It appears on the schedule and in the provider's reminder mail, and
in neither of the customer's emails.

## The worker

```bash
npm run worker
```

A separate process, not a route: this work outlives any request, and a web
instance being recycled mid-sweep must not lose it. It installs its own
repeatable schedules on boot (idempotently, so restarts do not accumulate
duplicates) and drains in-flight jobs on `SIGTERM` before exiting.

| Sweep               | Cadence          | Does                                                 |
| ------------------- | ---------------- | ---------------------------------------------------- |
| `booking-reminders` | every 15 minutes | Mails both sides 24 hours before a job               |
| `document-expiry`   | daily at 08:00   | Warns 30 days before a licence or certificate lapses |

### Why sweeps, not delayed jobs

A per-booking delayed job scheduled at confirmation time would have to be
found and cancelled whenever the booking moved or was called off, and would
be lost entirely if Redis were ever flushed.

A sweep re-derives what needs doing from the database on every run. It is
naturally correct after a restart, a data change, or an outage, and Redis
holds nothing that matters — which is the right split, because Redis here is
disposable and Postgres is not.

### Not sending twice, and not sending never

Both sweeps are idempotent on a marker column (`reminderSentAt`,
`expiryNoticeSentAt`), and the marker is written **after** the mail is
accepted. A crash between the two re-sends on the next run, which is the
harmless failure; writing the marker first would let a crash swallow the
reminder silently.

One bad address does not stop a sweep — failures are logged per booking and
the loop continues. Each run takes at most 200 rows so a backlog after
downtime drains oldest-first instead of stalling.

Only `CONFIRMED` bookings get reminders. Nobody should be told to expect a
visit the business has not agreed to.

## Timezones and the database

The Prisma connection pins its session to **UTC** (`options: "-c
timezone=UTC"` in `src/server/db.ts`). This is load-bearing, not hygiene.

Without it the driver sends a `timestamptz` as naive wall-clock text and
Postgres interprets it in the _server's_ zone, storing an instant offset by
however far that zone is from UTC. Reads are distorted by the same amount, so
writing a `Date` and reading it back agrees perfectly — the bug is invisible
to a round-trip test — while the value on disk is wrong, SQL comparisons
against `now()` are wrong, and the distortion **changes size across a
daylight-saving boundary**, so rows written in summer and winter stop being
comparable.

`booking_no_overlap` compares exactly those columns, so this is what keeps
double-booking prevention honest.

`src/server/db.integration.test.ts` asserts it by reading
`extract(epoch from …)`, which carries no timezone at all. A round-trip
assertion cannot catch this and is included there to show why.

## Not yet

- **No route optimisation.** The day sheet is in time order, not driving
  order.
- **No per-member schedule view.** Assignment is recorded and mailed, but
  every member sees the whole business's schedule.
- **No customer-visible technician name.** Assignment is internal for now.
- **Reminder timing is fixed** at 24 hours and not configurable per business.
