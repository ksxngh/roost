# Clients

The client list builds itself. There is no "add client" button, and that is
the design.

## Derived, not entered

A `Client` appears the moment a booking, quote, or invoice carries an email.
`linkClient` is called from all three creation paths and returns the id the
document stores.

A contact list you have to maintain by hand drifts from reality within a
month: the provider books someone, forgets to add them, and the CRM quietly
stops describing the business. Deriving clients from documents means the list
is exactly the set of people there is evidence of work for.

The consequence worth knowing: **a client cannot exist without at least one
document**. That is intentional.

## Identity

`(businessId, lower(email))`.

Email is the identity because it is the one field every document requires and
the one customers keep across a house move. It is lower-cased in exactly one
place (`normaliseEmail`), so `Dana@Example.com` and `dana@example.com` are the
same person.

Two businesses serving the same household hold **two independent records**.
One provider's notes are not another's, and neither should learn the other
exists — the unique constraint is scoped by business, and every read is
scoped by membership.

## What a new document changes

| Field                             | On a new document                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Name, phone, address              | Refreshed — someone who moves house should not get next month's job sent to the old address |
| A field the document leaves blank | Left alone — a quote with no address must not erase the address on file                     |
| Notes, archive state              | Never touched — these are the provider's, not the document's                                |

Addresses are normalised inside `linkClient` (postal code and province
upper-cased, whitespace trimmed) rather than at each call site, so a client
record can never disagree with the document it came from.

## Money

Lifetime value counts **paid invoices only**. Money that has been billed but
not received is not revenue, and a client list that implies otherwise is worse
than none — it would tell a provider to prioritise someone who has never
actually paid them. Outstanding is shown separately.

## Archiving, not deleting

Archiving hides a client from the working list and keeps every booking,
quote, and invoice attached to them. Those are financial records; a provider
tidying their list must not be able to erase what they billed. There is no
delete.

## Existing data

The migration backfills. Every booking, quote, and invoice already carried a
customer, so shipping an empty table would have made an established business's
client list look like they had never worked for anyone. The backfill groups
the three tables by `(businessId, lower(email))`, takes the name and address
from the most recent document, and points the existing rows at the clients it
creates.

## Not yet

- **No merging.** Someone who books under two different email addresses is
  two clients. Merging needs a rule for which record's notes survive.
- **No manual client creation**, deliberately — but it means a provider
  cannot pre-load a customer they have not yet quoted.
- **No client-facing portal.** A customer sees individual documents by
  reference ([booking.md](booking.md)), not a history of everything.
- **No tags or segments**, so no "email everyone in Surrey".
