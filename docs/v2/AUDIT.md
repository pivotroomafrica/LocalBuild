# Pivotroom V2 — Phase 1 Technical Audit

Audited 2026-10-10 against branch `claude/pivotroom-phase-1-foundation-qyj4r6`
and the live Supabase project `ckwchlksktrihpbwtidp` (PIVOTROOM-DEMO).
Everything below was read from the code or queried from the database; nothing
is assumed.

## 1. Current architecture

| Layer | What exists |
|---|---|
| Framework | Next.js **16.3.4**, **App Router**, React 19.2, TypeScript. Needs Node **≥ 20.9**. |
| Rendering | All data pages are server-rendered on demand (`ƒ`). Static: auth forms, `/dev/*`. |
| Server code | Server Actions (all mutations) + 3 route handlers: `/auth/callback`, `/api/payments/chapa/webhook`, `/api/jobs/process`. `/api/test/*` are mock-only. |
| Middleware | `proxy.ts` refreshes the Supabase session and protects `/dashboard`, `/expert`, `/admin`. |
| Database | Supabase Postgres, 45 migrations, 18 tables, **14 MB** total. RLS enabled on **every** public table. |
| Auth | Supabase Auth, email/password (the Google credentials are for Calendar only, not sign-in). Roles: `profiles.role` (customer/admin) + `expert_profiles` ownership. |
| Storage | Buckets `expert-profile-images` (private; published photos readable via policy) and `manual-payment-receipts` (private). |
| Payments | Chapa (real + mock), plus manual bank transfer with admin verification. |
| Email / calendar | Resend + Google Calendar/Meet behind provider interfaces, driven by a durable `integration_jobs` queue. |
| Background work | `/api/jobs/process` worker (secret-protected). **Nothing currently schedules it** — see FIX-1. |

## 2. Differences between the V2 brief and the real application

These are decisions for the product owner. None was changed silently.

| Brief says | Reality |
|---|---|
| "Existing AI API integration — expert matching" | **There is no AI matching code and no AI provider dependency.** The homepage/header search is name-only by an earlier explicit decision. |
| 20% commission, 15% VAT at checkout, payout records | **Not implemented.** Money columns are `bookings.base_price`, `payments.expected_amount`, `payments.amount_paid` only. The UI says "Applicable government taxes will be calculated separately." |
| Manual verification for transactions > 300,000 ETB | **No such threshold exists** in code or SQL. Manual bank transfers are always admin-verified; Chapa amount/currency mismatches go to `requires_review`. |
| Experts set a price per duration | Experts set **one base hourly price**; each duration's price is derived by fixed ratios (`lib/expert/pricing.ts`). Kept as-is per "preserve existing pricing rules". |
| PostHog analytics | **Not installed.** |
| "Nominate an Expert" page | **Does not exist.** |
| Category pages | Categories are filters on `/experts`, not separate pages. |

## 3. Component classification

**KEEP — working and efficient**

- **Double-booking prevention.** Two Postgres `EXCLUDE USING gist` constraints (`bookings_no_overlapping_expert_time`, `bookings_no_overlapping_customer_time`) over `tstzrange(start_at, end_at)` for active statuses. Concurrency-safe at the database level.
- **Hold expiry.** Expiry is checked lazily at request time (`hold_expires_at`); no cron or browser dependency. Expired holds stop blocking slots.
- **Availability** is computed by a single `get_bookable_slots` RPC over a bounded date range. There are no Realtime subscriptions anywhere.
- **Chapa.** The webhook verifies an HMAC-SHA256 signature with a timing-safe compare, then re-verifies the transaction server-side. The redirect/return URL never confirms anything on its own. Finalization is idempotent, and amount/currency mismatches go to `requires_review`.
- **Money storage** uses exact `numeric(12,2)` throughout; no floating-point columns.
- **Integration jobs** claim work via a compare-and-set on `status='pending'`, so overlapping worker runs are safe. Each job has a retry count and a sanitized `last_error`.
- **Secrets.** The service role and provider keys are server-only. Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_APP_URL` are public.

**OPTIMIZE**

- **OPT-1 Public expert data (done in this phase).** Every public page view ran the directory RPC with the visitor's cookie client and then made **one storage request per expert** to sign photo URLs. Fresh signatures on every request also defeated browser image caching, which costs egress.
- **OPT-2 Missing indexes / per-row RLS (migration 046, written and dry-run, not yet applied).** 9 unindexed foreign keys, and 3 policies re-evaluating `auth.uid()` per row.
- **OPT-3 Expert photos.** The upload is type-checked (JPEG/PNG/WebP) and capped at 3 MB, but it isn't resized or converted, so card thumbnails download the full original.
- **OPT-4 Directory size.** All published experts are sent to the browser for client-side filtering. This is fine for 60 experts. Around 300+, it needs server-side filtering or incremental rendering.
- **OPT-5 Multiple permissive RLS policies** (12 tables: `*_select_admin` + `*_select_own`). Correct, but each query evaluates every policy. Low impact at this size; merge later.

**FIX**

- **FIX-1 Integration jobs never run.** `pg_cron` and `pg_net` are installed, but `cron.job` is empty and nothing else calls `/api/jobs/process`. Booking-confirmation, cancellation and reschedule emails and Calendar events are queued but never sent. Runbook: `supabase/ops/schedule-integration-jobs.sql`. It needs the deployed public URL.
- **FIX-2 Stuck jobs.** A job interrupted mid-run (for example, the shared host killing the process) stays `processing` forever. Needs a reaper that returns stale `processing` rows to `pending`.
- **FIX-3 Logged-out visitors can't read categories.** The `expert_categories` RLS policy only allows `authenticated`, so the category filter strip is empty for visitors. Awaiting product-owner approval to add an anon read policy for active categories.
- **FIX-4 Leaked-password protection is off** in Supabase Auth (dashboard toggle).

**REPLACE** — nothing found that is incompatible with the target stack.

**DEFER**

AI matching (needs a provider decision), commission/VAT/payout ledger (needs approved tax rules), referral commissions, pgvector, PostHog, a second storage/CDN provider, Supabase Pro.

## 4. Security & booking risk summary

| Area | Status |
|---|---|
| Customer reads another customer's booking | Blocked by RLS (`bookings_select_own` / expert / admin). |
| Customer changes price | Prices are computed in SQL (`create_booking_hold`, `create_chapa_payment_attempt`) from `expert_session_types`; there's no client-supplied amount. |
| Confirm unpaid booking | Only server-side verified Chapa or admin-verified manual payment can confirm. |
| Forged webhook | Rejected (HMAC). Even a valid webhook only triggers a server-side re-verification with Chapa. |
| Duplicate webhook | Idempotent finalization. |
| Late payment after hold expired | Handled in `042_chapa_payments.sql` (late success → review path, never a silent conflicting booking). |
| Expert self-approval | Blocked by trigger and admin-only policies (verified in earlier phases). |
| SECURITY DEFINER RPCs callable by users | 38 flagged by the advisor. Each was audited earlier (task "SECURITY DEFINER function audit"): every one re-checks `auth.uid()`/ownership/`is_admin()` internally. Intentional. |

## 5. Yegara Premium (cPanel Node.js) compatibility

| Requirement | Finding |
|---|---|
| Node version | Needs ≥ 20.9 (Next 16). **Must confirm** Yegara's Node selector offers 20 or 22. |
| Runtime model | Full Node server is required (SSR, Server Actions, route handlers, middleware). **Static export is not viable** without losing auth, booking and payments. |
| Build on host | Not needed: `npm run build:standalone` produces a 74 MB self-contained folder with its own `server.js`. |
| Memory | About **110 MB RSS** after 20 requests on an idle local check. This is not a load test. |
| Webhooks / callbacks | Plain HTTPS POST/GET to `/api/payments/chapa/webhook` and `/auth/callback`. Work on any Node host with SSL. |
| Background workers | None required on the host; scheduling runs inside Supabase (`pg_cron` → HTTPS). |
| Caching | `unstable_cache` uses in-memory + local disk on a single process. Fine for one cPanel app instance. |

**Verdict: Option A (Yegara) is plausible but unverified.** It depends on Node ≥ 20.9 being available, Passenger running `server.js`, and the plan's RAM/process limits. Those can only be confirmed on the account itself. Option B (static export) would lose required functionality.

## 6. Recommended order

1. Apply migration 046 (after a backup).
2. Decide FIX-3 (categories for visitors).
3. Deploy to Yegara staging and verify Node/Passenger.
4. Schedule the jobs (FIX-1) once a public URL exists.
5. Job reaper (FIX-2).
6. Photo resizing (OPT-3).
7. Backup routine (`docs/v2/BACKUP.md`).
8. Load tests against staging.
9. AI matching and finance ledger, after product decisions.

## 7. Decisions applied (2026-10-11)

| Decision | Implemented as | Status |
|---|---|---|
| Apply migration 046 | Indexes + per-statement RLS policies | **Applied** to the live project |
| Visitors can see categories | `047a`: `expert_categories_select_active` now `to anon, authenticated`; categories moved into the shared public cache | **Applied** |
| VAT 15% added on top and shown as the main price; 20% commission included in the expert's price | `047b` `platform_settings` (rates in one row) · `047c` per-booking snapshot: `vat_amount`, `total_price`, `commission_amount`, `expert_payout_amount` (trigger on insert, locked on update) · `047d` payments charge `total_price`. Public prices, the booking panel and the admin booking page show VAT-inclusive totals; the expert pricing form shows "customer pays / you receive". Bookings made before 047 keep their original price. | **Applied**, verified in a rolled-back transaction: 2,500 → VAT 375 → customer pays 2,875 → commission 500 → payout 2,000 |
| Manual verification above 300,000 ETB | `047d`: `create_chapa_payment_attempt` refuses totals above `platform_settings.manual_verification_threshold`; the booking panel hides Chapa and asks for a bank transfer, which admins always verify | **Applied**, verified as a customer: Chapa refused at 310,500 ETB |
| AI matching with OpenAI, key later | `048`: `get_expert_match_candidates_public()` + `ai_match_requests` usage log (no problem text stored). `/match` page; keyword pre-filter → ≤ 15 candidates → one structured-output call → only offered experts kept. No key / over limit / API error → keyword matches. | **Applied**; OpenAI call tested with a mocked API only |

Interpretation to confirm: commission = 20% of the expert's price (excluding VAT). To change any rate later, update the single `platform_settings` row; new bookings pick it up, existing bookings keep their snapshot.

## 8. Website redesign, phase 1 (2026-10-19)

Public pages rebuilt from the Pivotroom website design (`app/site.css`, scoped under `.pr`). Real data only:

| Design element | Implemented as |
|---|---|
| "Top expert" badge, ranking | `049c`: sessions completed = paid bookings whose end time has passed (nothing sets `completed` yet); badge needs 3+ sessions, 2+ visible reviews, 4.5+ average. Directory ordered by that. |
| "After the session" reviews | `049b` `expert_reviews`; written only through `submit_expert_review()` (own booking, paid, ended, once). Customer page `/dashboard/sessions/[ref]/review`; admins hide/show on `/admin/experts/[id]`. Public shows first name + last initial. |
| Languages, "Replies within a day", experience timeline | `049a` columns, edited on the expert profile form. Reply time is the expert's own stated commitment (no messaging to measure it). |
| Founders / Professionals shelves | Split by the expert's own stated role (founder/owner/CEO/managing director). |
| "10% off your first session" | **Not built yet** (needs the discount rules); the home promo section is left out until it exists. |
| Fake numbers, example people, onboarding assistant, Google/phone sign-in | Not shown. About page uses live counts; the matcher example lists what you get, not invented experts. |
| Legal pages | Draft text in `lib/legal/content.ts`, shown with a "Draft under legal review" notice until `LEGAL_REVIEWED = true`. Bracketed values need answers. |
