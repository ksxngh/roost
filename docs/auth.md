# Authentication

Better Auth ([ADR-0002](adr/0002-better-auth.md)) with the Prisma adapter.

## Surfaces

| Path                 | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `/signup`            | Email/password registration (+ Google when enabled)   |
| `/login`             | Sign in                                               |
| `/forgot-password`   | Request a reset link                                  |
| `/reset-password`    | Consume a reset token, set a new password             |
| `/api/auth/[...all]` | Better Auth HTTP handler (sign-in, callbacks, verify) |

Signed-in visitors hitting `/login` or `/signup` are redirected to
`/dashboard`.

## Route protection

`src/app/(app)/layout.tsx` calls `requireSession()`, so **every** route in the
`(app)` group is protected by construction — adding a page cannot accidentally
leave it public. `getSession()` is wrapped in React's `cache`, so a layout and
its page share one lookup per request.

There is deliberately no auth middleware: a server-layout check cannot be
bypassed by a crafted request the way a matcher-based middleware config can
when someone forgets to update the matcher.

## Session handling

- 30-day expiry, refreshed at most once per day (`updateAge`).
- **Cookie cache** (5 minutes): most requests validate the session from a
  signed cookie instead of hitting Postgres. Sign-out revokes server-side, so
  the worst case is a 5-minute window on a _different_ device — acceptable for
  this product, and the tradeoff is documented here rather than hidden.
- Cookies are `httpOnly` and `sameSite=lax`; `secure` switches on
  automatically when `NEXT_PUBLIC_APP_URL` is https.

## Rate limiting

Credential endpoints are throttled in `src/server/auth.ts`:

| Endpoint                  | Limit         |
| ------------------------- | ------------- |
| `/sign-in/email`          | 5 per minute  |
| `/sign-up/email`          | 10 per hour   |
| `/request-password-reset` | 5 per hour    |
| `/reset-password`         | 10 per hour   |
| everything else           | 60 per minute |

Limits are keyed by client address and enforced in the HTTP layer — direct
`auth.api.*` calls from server code bypass them by design, which is why the
tests exercise `auth.handler` with real `Request` objects. Rate limiting is
enabled in **every** environment, not just production, so the same protection
runs in development and tests.

### Shared Redis storage

Counters live in Redis, not each instance's memory, via a `customStorage`
implementation (`src/server/auth-rate-limit-storage.ts`) plugged into Better
Auth. Behind more than one instance an in-memory limiter would multiply the
effective limit by the instance count and let a brute-force attempt simply
spread across processes; the shared store makes each limit hold globally.

The atomic `consume` path — a single Redis `INCR`, with the window's TTL set
only when the counter is first created — is what Better Auth uses. Doing the
check and increment in one step closes the concurrent-bypass gap where many
simultaneous requests each read a stale count before any increment lands.

The limiter **fails open**: if Redis is unreachable a request is allowed rather
than denied. Locking every user out of sign-in during a cache blip is worse
than briefly losing one layer of defence — passwords are still hashed and the
endpoints still validate. Failures are logged.

## Email

`src/server/mailer.ts` defines a `Mailer` interface with two transports:

- **ConsoleMailer** (default): prints verification and reset mail to the
  server log. Development works with no email provider — copy the link from
  the terminal.
- **ResendMailer**: used automatically when `RESEND_API_KEY` is set.

Verification mail is sent on signup, but **sign-in is not blocked on
verification**. Unverified accounts see a warning in Settings. This flips to
required once production email delivery is configured — doing it earlier
would lock out every user the moment mail delivery hiccuped.

## Google OAuth

Google is configured only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
are both present; `googleAuthEnabled` drives whether the button renders, so
there is never a button that leads to a broken flow.

To enable it: create an OAuth client at
<https://console.cloud.google.com/apis/credentials>, set the redirect URI to
`<NEXT_PUBLIC_APP_URL>/api/auth/callback/google`, and put the credentials in
`.env`.

## Security properties covered by tests

- Passwords are hashed — the plaintext never appears in `account.password`.
- Wrong password and unknown email both return 401 with the same UI message
  (no user enumeration).
- Password reset resolves identically for known and unknown addresses.
- Sessions are revoked server-side on sign-out; a stale cookie resolves to
  `null`.
- Garbage tokens resolve to `null` rather than erroring.
