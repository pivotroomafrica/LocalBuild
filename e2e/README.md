# Pivotroom E2E test suite (Playwright)

Full-system browser E2E automation, built as part of the "Full System
Regression + Security + E2E Audit" workflow. This suite drives the real
Next.js app against the real PIVOTROOM-DEMO Supabase project -- there is no
mock backend.

## Execution status (read this first)

**This suite was authored but could not be executed in the session that
wrote it.** That session's sandbox has outbound HTTPS routed through a
proxy that returns a policy-level `403` for the Supabase project host
(confirmed via `curl` returning `CONNECT tunnel failed, response 403` and
the proxy's own status endpoint logging an explicit
`connect_rejected` / `"policy denial or upstream failure"` entry for
`*.supabase.co:443`). Since every page in this app calls Supabase on
render, `next dev` cannot serve a single page from that sandbox, so
`npm run test:e2e` could not be run there.

The suite is written to run for real:
- on a developer machine with normal internet access, or
- in CI, once `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  and `SUPABASE_SERVICE_ROLE_KEY` are available as secrets.

Treat every spec in `e2e/specs/` as **written but unverified by an actual
run** until someone with real network access executes it. The actual
verification substance for the audit that produced this suite came from
direct, live Supabase SQL testing (the same `SET ROLE authenticated` /
`request.jwt.claims` technique used throughout this project's development)
plus code-level audits (SECURITY DEFINER enumeration, RLS policy
enumeration) plus standard build checks (`tsc`, `eslint`, `next build`) --
see the top-level completion report for those results. This suite is
real, durable, runnable infrastructure for whoever next has network
access, not a substitute for that live testing.

## Running it

```bash
# One-time
cp .env.example .env.local   # if not already present, fill in Supabase creds

npm run test:e2e             # headless, all projects
npm run test:e2e:headed      # headed (see the browser)
npm run test:e2e:auth        # just auth-nav.spec.ts
npm run test:e2e:availability
npm run test:e2e:booking
npm run test:e2e:payments
npm run test:e2e:dashboards
npm run test:e2e:security
npm run test:e2e:chapa       # Phase 8 -- see "Chapa (Phase 8) tests" below
```

`playwright.config.ts` boots `next dev` itself (`webServer`), so a single
command is enough locally. In CI, set `CI=true` so the config does not
try to reuse an already-running dev server.

## Required environment variables

Same Supabase project the app itself uses (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` -- used ONLY by `e2e/fixtures/supabase-admin.ts`
  for fixture provisioning/cleanup and deterministic time-travel (see
  below). No app code path uses this key; it is exactly what
  `.env.example` already documents it as reserved for.

Optional overrides (defaults are fixed, deterministic values so the suite
runs out of the box against a fresh copy of the demo project):

- `TEST_CUSTOMER_A_EMAIL` / `TEST_CUSTOMER_A_PASSWORD`
- `TEST_CUSTOMER_B_EMAIL` / `TEST_CUSTOMER_B_PASSWORD`
- `TEST_EXPERT_A_EMAIL` / `TEST_EXPERT_A_PASSWORD`
- `TEST_EXPERT_B_EMAIL` / `TEST_EXPERT_B_PASSWORD`
- `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` -- **this account must
  already have `profiles.role = 'admin'` set** (the same manual promotion
  step every admin account in this project requires -- `profiles.role` is
  never settable through the app itself, by design, see migration
  `013_admin_authorization.sql`). `ensureTestFixtures()` creates the auth
  user and profile row but cannot self-promote it to admin any more than
  the app can.
- `TEST_DUAL_IDENTITY_EMAIL` / `TEST_DUAL_IDENTITY_PASSWORD`
- `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`)

No password is ever committed -- see `.env.example` for the placeholder
entries.

## Chapa (Phase 8) tests

`chapa.spec.ts` exercises the Chapa payment integration end to end against
**MockChapaClient** (`lib/chapa/mock.ts`), never the real Chapa API -- the
normal suite must not depend on Chapa's uptime (spec section 63). It needs
three env vars the rest of the suite doesn't, all supplied automatically
by `npm run test:e2e:chapa`:

- `CHAPA_MODE=mock` -- selects `MockChapaClient` and unlocks the
  `CHAPA_MODE=mock`-gated `/api/test/chapa-mock/*` routes (both otherwise
  404, even in production, by construction).
- `CHAPA_WEBHOOK_SECRET` -- any value; the spec computes its own
  `x-chapa-signature` HMAC using this same value from `process.env`, so
  the exact value doesn't matter as long as the test process and the
  `next dev` server it starts see the same one.
- `NEXT_PUBLIC_APP_URL` -- required by `lib/chapa/config.ts`'s
  `getAppUrl()` to build the return/callback URLs; defaults to
  `PLAYWRIGHT_BASE_URL` (or `http://localhost:3000`).

Running `npm run test:e2e` (no `CHAPA_MODE`) skips `chapa.spec.ts`
automatically (`isChapaConfigured()` is false, so "Pay with Chapa" never
renders) rather than failing -- the rest of the suite runs exactly as
before Phase 8. `npm run test:e2e:chapa` runs only this one file, with its
own env, the same way `test:e2e:payments` etc. scope to one file.

`CHAPA_SECRET_KEY` is never read at all in mock mode -- there is no real
credential involved in this file, and it never calls `api.chapa.co`.

## Test data safety (spec section 2)

Every fixture account and every row this suite creates is scoped to one
of six deterministic identities: `test_customer_a`, `test_customer_b`,
`test_expert_a`, `test_expert_b`, `test_admin`, `test_dual_identity`
(`e2e/fixtures/env.ts`). `ensureTestFixtures()` (`e2e/fixtures/supabase-admin.ts`)
is idempotent -- upserts, never duplicates -- and provisioning/cleanup
helpers only ever touch rows scoped to a fixture user id or a specific
booking id a test itself created. Nothing outside that set is ever read
destructively or deleted.

`expert-application.spec.ts` is the one exception: it provisions a
throwaway, timestamp-suffixed applicant account for the wizard-to-approval
flow specifically, and deletes it in `afterAll`.

## Test isolation (spec section 3)

Specs that create bookings/payments track the row ids they create and
delete them in `afterEach`/`afterAll` (`cleanupBooking()`), so a failed
test does not leave state that corrupts a later one. Fixture accounts
themselves (and their base expert profile / availability rule) are never
torn down between tests -- they are stable background state, re-asserted
idempotently by `ensureTestFixtures()` at the start of every spec file.

## Time-based testing strategy (spec section 4)

The audit spec that requested this suite suggested adding
environment-configurable short durations to production code (e.g.
`TEST_BOOKING_HOLD_SECONDS`) so tests would not need to wait real minutes
or hours for a hold/grace-period/verification-hold to expire.

This suite takes a different, and we believe strictly better, path to the
same goal: **`e2e/fixtures/supabase-admin.ts`'s `backdateHoldExpiry()`
uses the Supabase service-role client to directly set a booking's
`hold_expires_at` into the past**, then the test reloads the page and
asserts the app treats it as expired. This is:

- **Deterministic and non-waiting** -- identical benefit to the env-var
  approach.
- **Zero production risk** -- `booking_hold_minutes()`,
  `payment_rejection_grace_minutes()`, and
  `manual_payment_verification_hold_hours()` (the SQL policy-constant
  functions) are not touched at all. There is no test-only code path
  inside any already-verified production SQL function, and no risk of a
  test-mode flag ever leaking into production behavior.
- **Consistent with how every previous phase of this project was already
  verified** -- the same "set the real timestamp into the past, then
  assert on real derived state" technique used throughout live SQL
  testing since Phase 5.

This is a deliberate engineering decision, not an oversight of the
original spec's suggestion -- flagged here explicitly per spec section 88
("do not change business logic to make tests pass... do not weaken
business logic just for tests").

## Structure

```
e2e/
  README.md                    -- this file
  fixtures/
    env.ts                     -- typed env var access, fixture account config
    supabase-admin.ts          -- service-role client, fixture provisioning/cleanup, time-travel
    auth.ts                    -- UI login/logout helpers, dialog auto-accept
    booking.ts                 -- booking picker / intake / payment form helpers
  specs/
    auth-nav.spec.ts           -- Phase 1 + auth-aware nav repair + route protection
    expert-application.spec.ts -- Phase 2 wizard + Phase 3 admin review, start to finish
    availability.spec.ts       -- Phase 4 + availability-disappearing-on-back-nav repair
    booking.spec.ts            -- Phase 5 booking hold lifecycle + concurrency + release
    payments.spec.ts           -- Phase 6 manual payment + rejection-grace repair
    dashboards.spec.ts         -- Phase 7 dashboards + RLS-OR-combination-leak regression
    security.spec.ts           -- direct object reference + raw error leakage + storage privacy
    responsive.spec.ts         -- structural mobile/tablet/desktop checks (not aesthetics)
    chapa.spec.ts              -- Phase 8 Chapa payments (mock provider only, see above)
```

## What this suite deliberately does NOT cover

- Real Chapa/bank/email/Google Calendar provider network behavior -- Phase
  8's Chapa flow is covered against `MockChapaClient` only (see "Chapa
  (Phase 8) tests" above); a small manual real-Chapa-test-mode smoke check
  (successful test payment, failed/cancelled test payment, a real webhook
  delivery) is documented as PENDING in the Phase 8 completion report,
  since it needs a real Chapa test account/credential this project does
  not have. Bank transfer, email, and Google Calendar have no real
  provider integration at all yet, so there is nothing further to test.
- Visual/aesthetic polish, copy tone, animation quality -- `responsive.spec.ts`
  checks structure (overflow, reachability) only, never colors/spacing/wording.
