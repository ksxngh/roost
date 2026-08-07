# Teams & permissions

Who works at a business, what each person may do, and how someone joins.

## Roles and capabilities

There are three roles and four capabilities.

| Role     | What it means                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `OWNER`  | The business belongs to them. Every capability, plus ownership transfer. Exactly one per business.             |
| `ADMIN`  | Runs the business day to day. Every capability, plus managing members. Cannot touch the owner or other admins. |
| `MEMBER` | A field tech. Holds only the capabilities granted to them.                                                     |

The capabilities — `SCHEDULE`, `BILLING`, `CLIENTS`, `STOREFRONT` — are what
makes permissions _granular_. A member can be trusted with the calendar
(`SCHEDULE`) but kept away from the money (`BILLING`). OWNER and ADMIN hold all
four implicitly; they are only ever checked for a MEMBER.

`hasCapability` is a pure function, so the same rule drives both the server
gates and the UI that shows a member what they can do. Every mutation that
used to call `requireEditor` now calls `requireCapability` with the capability
it needs; the module map:

| Area                                                   | Capability   |
| ------------------------------------------------------ | ------------ |
| Storefront, services, hours, availability, documents   | `STOREFRONT` |
| Bookings — accept, decline, assign, complete, annotate | `SCHEDULE`   |
| Quotes and invoices                                    | `BILLING`    |
| Client notes and archiving                             | `CLIENTS`    |

`requireEditor` still exists but now means only "admin or owner", and guards
the one thing no capability grant should unlock: managing the team itself.

## Seats

A business's plan sets the seat limit — 1 on Pro, 8 on Premium — read from
`src/lib/plans.ts`, the same source the pricing page uses.

**Pending invitations count against the limit.** Otherwise a business could
send eight invites on a one-seat plan and only discover the problem when the
ninth person tries to accept and finds no room. The check runs at invite time
against members-plus-outstanding-invites, and _again_ inside the accept
transaction against live members — so a team that filled up between invite and
accept cannot overflow.

> **Plan default.** Billing is not wired up yet (Milestone 10), so a new
> business defaults to `PREMIUM`. During the pre-billing phase nobody is
> charged, so gating team features behind a payment nobody can make would help
> no one. Milestone 10 sets the plan from the real subscription and handles a
> business that has more members than a downgraded plan allows.

## Invitations

Inviting returns a **token** — a 32-byte CSPRNG value, not the short
human-readable reference bookings use. The token is the whole authorisation:
whoever holds it can join. So it leaves the server exactly once, in the
invitation email, and is never listed back to the team page. A leaked team
view cannot hand out working tokens.

Accepting requires that the signed-in account's email **matches the invited
address**. A token grants that specific person entry, not anyone who happens
to hold the link. The accept page states the mismatch up front rather than
letting the attempt fail.

Invitations expire after 14 days. Re-inviting an address refreshes the
existing invitation rather than creating a second.

## Who can manage whom

- **OWNER**: full control. Invite or remove anyone, set any assignable role,
  transfer ownership.
- **ADMIN**: manages MEMBERs only. Cannot invite or edit another admin, cannot
  mint admins (only the owner promotes), cannot touch the owner.
- Nobody may edit or remove **themselves** through this surface, so an admin
  cannot promote itself, and the last owner cannot orphan the business.

Promoting a member to admin clears their capability grants — an admin has all
of them anyway — so a later demotion does not silently restore an old set.

## Removing a member

Their assigned jobs fall back to unassigned (`onDelete: SetNull`) rather than
vanishing, and the records they authored keep standing. Removal frees the
seat. The owner can never be removed this way; ownership is transferred first.

## Not yet

- **No self-service leave.** A member cannot remove themselves; an admin or
  owner does it.
- **Ownership transfer has no UI yet** — the service function exists and is
  tested, but the team page does not surface it.
- **No per-member schedule filtering.** Capabilities gate _actions_, not
  _visibility_: a member with `SCHEDULE` sees the whole business's calendar,
  not only their own jobs.
