# Pivotroom

Expert marketplace where customers book paid one-to-one consultations with
experienced professionals.

**Current implemented milestone: Pivotroom V1 Phase 4 — Expert
Availability Engine (monthly model).** Customers can apply to become
experts (Phase 2); an admin can review and publish an application (Phase
3); an approved expert can now make a small amount of time available each
month (Pivotroom's actual product model — 1-5 hours/month, not a
traditional weekly work schedule), either as a recurring monthly rule
("first Monday, 3-4 PM") or a one-time specific date, for a future
booking engine to consume. Bookings and payments are still not
implemented — see "Explicitly not implemented" below.

**Note on Phase 4's history:** Phase 4 originally shipped with a
Monday-Sunday recurring *weekly* schedule model. That was retired in a
same-phase adjustment before any real user ever used it (verified: zero
rows existed in its tables) in favor of the monthly model described
throughout this document, once it became clear the weekly model didn't
match Pivotroom's actual low-commitment expert-recruitment proposition.
The retirement is itself a migration (`022_retire_weekly_availability_
model.sql`), not a rewrite of history — see "Database" below.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind v4) + Supabase (Auth, Postgres,
Storage, RLS).

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in the values from the
   PIVOTROOM-DEMO Supabase project (Project Settings → API). See
   "Environment variables" below.
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Defined in `.env.local` (gitignored — never commit it). `.env.example`
documents the names only.

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Public, safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Public, safe to expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | *(reserved, still unused)* | Not used anywhere in this codebase, Phase 3 included — admin authorization is fully data-driven (`profiles.role = 'admin'`, checked via `is_admin()` and RLS), so every admin write still runs through the normal authenticated client under RLS, never a privileged service-role connection. Never expose to the browser. |

## Supabase (PIVOTROOM-DEMO)

This project connects only to a demo/dev Supabase project (`PIVOTROOM-DEMO`),
containing fake data only. Never point `.env.local` at a production project.

**Manual Supabase Dashboard configuration required:**

- **Auth → URL Configuration**: set Site URL to `http://localhost:3000` and
  add `http://localhost:3000/**` to the redirect URL allowlist, so email
  confirmation and password-reset links work locally.
- **Auth → Providers → Email**: by default new Supabase projects require
  email confirmation before login. The signup form already handles both
  cases (shows "check your email" or logs the customer in immediately), but
  if you want instant login during local testing, turn "Confirm email" off.
- **Auth → Providers → Password strength**: the security advisor flags
  "Leaked Password Protection Disabled" (checks new passwords against
  HaveIBeenPwned). Not required for local dev; worth turning on before any
  real deployment.
- **Promoting an admin**: there is no self-service or API path to become an
  admin anywhere in this codebase, by design (`profiles.role` escalation is
  blocked for every client, admin included — see "Row Level Security"
  below). To test the admin flow locally, sign up a normal account through
  `/auth/signup`, then in the Supabase SQL editor run
  `update public.profiles set role = 'admin' where id = '<user id>';`.

## Database

Schema lives entirely in `supabase/migrations/`, applied in order. Phase 1
migrations (`001`–`004`) are unchanged by Phase 2 — nothing here modifies or
replaces them.

**Phase 1:**
- `001_profiles.sql` — the `profiles` table (shared identity, one row per
  `auth.users`), the `handle_new_user()` trigger that creates it on signup,
  and the reusable `set_updated_at()` trigger function.
- `002_industries.sql` — the `industries` lookup table.
- `003_customer_profiles.sql` — the `customer_profiles` table (customer
  professional profile, unique per customer).
- `004_customer_rls.sql` — Row Level Security policies, column-level
  privilege grants, and the `protect_privileged_profile_fields()` trigger
  that blocks role/account_status escalation.

**Phase 2:**
- `005_expert_profiles.sql` — the `expert_profiles` table: both the expert
  application record and the foundation of the future public expert
  profile. One row per user (unique constraint). Submitting an application
  never changes `profiles.role` — it stays `customer` throughout Phase 2.
- `006_expert_categories.sql` — the `expert_categories` lookup table
  (distinct from `industries` — what an expert offers to advise on, not
  their own industry background).
- `007_expert_profile_categories.sql` — join table for an applicant's
  selected categories, capped at 3 by a trigger
  (`enforce_expert_category_limit()`).
- `008_expert_session_types.sql` — `expert_session_types`: base session
  offerings (duration/price/format). No commission, VAT, or payout math —
  that belongs to a future payments phase.
  V1 pricing model (see `011_expert_base_pricing.sql` below): an expert
  sets one 60-minute rate; every enabled duration's row here is *derived*
  from it, not entered individually.
- `009_expert_storage.sql` — creates the `expert-profile-images` Storage
  bucket (private, 3&nbsp;MB cap, image MIME types only).
- `010_expert_rls.sql` — RLS policies, column grants, and
  `protect_expert_profile_privileged_fields()` (blocks self-approval,
  self-rejection, self-publishing, and moving `user_id`) for every Phase 2
  table, plus Storage policies scoping each applicant to their own photo
  path (`<user_id>/profile-photo`).
- `011_expert_base_pricing.sql` — adds `base_hourly_price`,
  `online_enabled`, `in_person_enabled` to `expert_profiles`: the source
  of truth for the V1 base-rate pricing model. Purely additive — does not
  modify `expert_session_types` or any migration above.

**Phase 3:**
- `012_expert_review_fields.sql` — adds `reviewed_at`/`reviewed_by`/
  `review_message`/`approved_at`/`approved_by`/`published_at`/
  `published_by` to `expert_profiles`, and extends the
  `application_status` check constraint to allow `changes_requested`.
  Minimal audit trail by design (spec-sanctioned): one current review
  message, no separate review-events/history table — a past round's
  message is overwritten by the next admin action, never retained.
- `013_admin_authorization.sql` — the `is_admin()` `SECURITY DEFINER`
  helper (checks the *caller's own* `profiles.role`, never anyone else's);
  new RLS SELECT/UPDATE policies on `expert_profiles` and SELECT policies
  on `expert_profile_categories`/`expert_session_types`/`profiles` scoped
  to `is_admin()`; column grants for the 7 new fields; and a rewritten
  `protect_expert_profile_privileged_fields()` with an admin branch (the
  full review + publish state machine below) alongside the
  byte-for-byte-preserved applicant branch, extended by exactly one
  transition (`changes_requested → submitted`, for resubmission). Also
  adds `expert_review_message_required_check`: the database itself
  refuses a `changes_requested`/`rejected` row with an empty message, independent of
  server-action validation.
- `014_expert_review_trigger_fix.sql` — fixes a gap live-testing found in
  013's applicant branch: `profile_status` was writable back to `'draft'`
  by the applicant even after approval/publication (not a public-visibility
  leak — `draft` is never selected by the public views — but it let an
  applicant self-eject their own profile from the admin-managed publish
  state machine, contradicting "only admin performs review decisions").
  Fixed by scoping applicant-writable `profile_status` to the pre-review
  phase only (`draft`/`submitted`/`changes_requested`).
- `015_is_admin_revoke_anon.sql` — a security-advisor follow-up: Supabase's
  default privileges separately grant new functions EXECUTE to `anon`
  (013's `revoke ... from public` only stripped the PUBLIC pseudo-role
  grant). `is_admin()` has no legitimate anon use, so this closes it —
  not a data leak either way, since the function only ever reports the
  caller's own admin status.
- `016_public_expert_views.sql` — the three views the entire public
  surface reads through: `expert_directory_public` (card projection),
  `expert_profile_public` (full single-profile projection), and
  `expert_session_types_public` (active-duration pricing) — every one
  filtered to `profile_status = 'published'` and keyed by `slug`, never
  `id`/`user_id`. Plus one Storage policy making a published expert's
  photo (and only that photo) readable by `anon`/`authenticated`, and a
  supporting index on `expert_profiles.profile_status`.
- `017_expert_photo_public_fix.sql` — fixes a gap live-testing found in
  016's storage policy: its `EXISTS` subquery against `expert_profiles`
  was itself evaluated as the querying role, so `anon` (who has no RLS
  visibility into that table) always saw zero matches — even a genuinely
  published expert's photo stayed invisible. Fixed with the same
  `SECURITY DEFINER` pattern as `is_admin()`:
  `is_published_expert_photo()` bypasses RLS for this one narrow,
  read-only, non-sensitive check.
- `018_expert_photo_admin_access.sql` — a Storage policy letting an admin
  view any applicant's photo during review, before it is ever published
  (neither the owner-only nor the published-only policy covered this).

**Phase 4 (original — weekly model, retired same-phase):**
- `019_expert_availability_tables.sql` — `expert_availability_settings`
  (timezone — **kept and reused**, see below), `expert_availability_
  windows` (recurring **weekly** schedule — **retired**), `expert_
  unavailable_dates` (full-day exceptions — **kept and reused**).
- `020_expert_availability_rls.sql` — RLS for all three tables above.
- `021_expert_availability_functions.sql` — `resolve_own_approved_expert_
  profile_id()` (internal only — **kept, still used by every function
  below**), `save_expert_availability_schedule()` (the weekly-schedule
  RPC — **retired**), `add_expert_unavailable_date()` /
  `remove_expert_unavailable_date()` (**kept and reused unchanged**).

**Phase 4 adjustment (monthly model — the model actually in use today):**
- `022_retire_weekly_availability_model.sql` — drops
  `save_expert_availability_schedule()`, drops
  `expert_availability_windows` (verified zero rows live before writing
  this migration — see "Old Phase 4 model" in the completion report for
  the exact query), drops `prevent_expert_availability_window_overlap()`.
  Updates the `comment on table` for `expert_availability_settings` and
  `expert_unavailable_dates` to describe their reused role. Does **not**
  touch `resolve_own_approved_expert_profile_id()`,
  `add_expert_unavailable_date()`, or `remove_expert_unavailable_date()`
  — none of them ever referenced the dropped table.
- `023_expert_monthly_availability_tables.sql` — the two new tables:
  `expert_monthly_availability_rules` (`week_of_month` ∈ first/second/
  third/fourth/last, `day_of_week`, local `start_time`/`end_time`; a
  trigger blocks overlapping rules for the same expert/day, treating
  "fourth" and "last" as the same recurrence bucket — see "Overlap
  protection" below) and `expert_one_off_availability` (a specific
  `available_date` + local time window; a trigger blocks overlapping
  windows on the same date). Same 15-minute-grid + `end > start` CHECK
  constraints as the retired weekly table.
- `024_expert_monthly_availability_rls.sql` — RLS for both new tables,
  identical pattern to `020`: owner-while-approved `SELECT`, admin
  `SELECT`, no `authenticated` write grant at all.
- `025_expert_monthly_availability_functions.sql` — the date-arithmetic
  helpers (`nth_weekday_of_month()`, `is_last_weekday_of_month()`,
  `monthly_rule_matches_date()` — internal only, mirrored exactly in
  `lib/availability/engine.ts` for client-side instant feedback);
  `add/update/remove_expert_monthly_rule()` (5-hour cap, overlap
  including the fourth/last bucket, 15-minute grid); `add/update/
  remove_expert_one_off_availability()` (same-date overlap, plus
  overlap against any recurring rule that resolves to that exact date).
- `026_expert_availability_timezone_function.sql` — a gap found and
  fixed in the same session: `022` dropped the only function that ever
  wrote `expert_availability_settings.timezone`
  (`save_expert_availability_schedule()`), but that table was
  deliberately kept for reuse. `set_expert_availability_timezone()`
  fills the gap it left — the only write path for the timezone now.

`supabase/seed.sql` seeds the 17 industries and the 8 expertise categories.
It's separate from the migrations on purpose — schema vs. seed/demo data are
never mixed. Fake customer/applicant accounts are **not** seeded there
(inserting directly into `auth.users` bypasses Supabase Auth's password
machinery); create test accounts through the real `/auth/signup` flow
instead.

Apply migrations and seed via the Supabase Dashboard SQL editor, the
Supabase CLI (`supabase db push`), or the Supabase MCP tools, in the order
listed above.

Public application tables (11 total — Phase 3 added columns/views to the
Phase 2 set of 7, not new tables; Phase 4 nets 4 new ones: 3 kept from the
original weekly model minus `expert_availability_windows`, which was
dropped, plus the 2 new monthly-model tables): `profiles`, `industries`,
`customer_profiles`, `expert_profiles`, `expert_categories`,
`expert_profile_categories`, `expert_session_types`,
`expert_availability_settings`, `expert_unavailable_dates`,
`expert_monthly_availability_rules`, `expert_one_off_availability`. Plus
3 views (`expert_directory_public`, `expert_profile_public`,
`expert_session_types_public` — safe public projections, not independent
data). Supabase Auth's own `auth.users` is the root identity; nothing
here duplicates it. There is no separate expert authentication system —
an expert application is just another row owned by an existing
`auth.users`/`profiles` identity, and there is no separate admin
authentication system either — an admin is just a `profiles` row with
`role = 'admin'`.

No new table was added for the Phase 3 review/publish workflow. A
review-events/history table was considered and deliberately rejected: the
spec explicitly sanctions keeping only the *current* review message
(overwritten by each new admin action, no history), so a handful of
columns on `expert_profiles` (`012_expert_review_fields.sql`) covers it
without a second table whose only job would be redundant audit rows.

Phase 4's four availability tables ARE four genuinely separate
responsibilities (timezone / recurring monthly rule / one-off date /
full-day exception — spec section 22) and are deliberately NOT collapsed
into one JSON blob column: future booking queries need predictable,
indexable, constraint-enforced schedule data, which a JSON configuration
column can't give at the database level. No pre-generated future
time-slot table exists anywhere — availability stays rule-based (a
handful of recurring-rule and date rows per expert), never a row per
possible future appointment time, and never a per-month or per-date row
for a recurring rule ("first Monday" is stored exactly as that one rule,
resolved to actual calendar dates only when asked).

## Storage

- **Bucket:** `expert-profile-images` (private — experts are not public yet,
  so nothing in it is fetchable without an authorized request).
- **Allowed formats:** JPEG, PNG, WebP only (enforced by the bucket's
  `allowed_mime_types`, checked again in `uploadExpertPhotoAction`).
- **Size limit:** 3&nbsp;MB (enforced by the bucket's `file_size_limit`,
  checked again client-side before upload). Automatic resizing/compression
  is not implemented in Phase 2 — see "Known limitations" in the completion
  report.
- **Ownership:** each object's path is `<user_id>/profile-photo` (fixed,
  extension-less, `upsert: true` on every write, so re-uploading replaces
  the old file instead of accumulating copies). Storage RLS policies
  restrict select/insert/update/delete to objects whose path's first
  segment matches the caller's own `auth.uid()`.
- **Public delivery (Phase 3):** the bucket's `public` flag is still
  `false` — it is never made public. A published expert's photo is
  reachable through one additional, narrowly-scoped SELECT policy
  (`017_expert_photo_public_fix.sql`) that matches only objects whose path
  is the `profile_image_path` of a currently-`published` `expert_profiles`
  row; a draft/submitted/changes_requested/approved-but-unpublished/
  rejected/suspended applicant's photo is not matched and stays exactly as
  private as before. The app resolves this to a signed URL server-side
  (`getExpertPhotoUrl`, `lib/expert/data.ts`) for both the public profile
  page and the applicant's own private preview — the raw storage path
  (which encodes the owner's `user_id`) is never sent to a client
  component. A second policy (`018_expert_photo_admin_access.sql`) lets an
  admin view any applicant's photo during review, before publish.

## Row Level Security

Every table added in Phase 2 follows the same three-layer approach as Phase 1:

1. **RLS policies** scope every row to its owner — directly on
   `expert_profiles` (`user_id = auth.uid()`), and via an `EXISTS` subquery
   through `expert_profiles` on the two child tables
   (`expert_profile_categories`, `expert_session_types`).
2. **Column-level `GRANT`/`REVOKE`** controls which columns are writable at
   all (order matters — see the comment at the top of
   `010_expert_rls.sql`: a table-level `REVOKE` strips column-level grants
   for that same privilege too, so `REVOKE` must always run before the
   narrower `GRANT`).
3. **`protect_expert_profile_privileged_fields()`** (a trigger) controls
   *which values* a client update may set: the only self-service
   `application_status` transition is `draft → submitted` (which also
   stamps `submitted_at`), and `profile_status` may only ever become
   `draft`/`ready`. `approved`, `rejected`, `published`, and `suspended`
   are unreachable from client code no matter what a request contains —
   confirmed live against PIVOTROOM-DEMO (see the Phase 2 completion
   report for every test).

`expert_categories` is read-only for applicants (active rows only), same as
`industries`. Storage policies (above) provide the same isolation for
profile photos.

**Phase 3 admin authorization** follows the same three layers, applied a
second time for the admin role:

1. **`is_admin()`** (`013_admin_authorization.sql`) — a `SECURITY DEFINER`
   SQL function that checks the *calling* user's own `profiles.role`,
   bypassing RLS on `profiles` for that one lookup (necessary: without
   `SECURITY DEFINER`, a policy that calls `is_admin()` from inside a
   policy *on* `profiles` would recurse into itself). There is no separate
   Postgres role for "admin" — every logged-in user authenticates as the
   same `authenticated` role, so admin-ness is purely data-driven.
2. **Additive RLS policies** — `expert_profiles_select_admin` /
   `expert_profiles_update_admin`, plus SELECT policies on
   `expert_profile_categories`, `expert_session_types`, and `profiles`,
   all scoped to `is_admin()`. These sit *alongside* the existing
   owner-only policies from `010_expert_rls.sql` (RLS policies are OR'd
   together for the same command), so applicant self-service access is
   completely unchanged.
3. **The rewritten trigger** — `protect_expert_profile_privileged_fields()`
   now branches on `is_admin()`. The admin branch is the small, explicit
   state machine below; the applicant branch is untouched except for the
   one added resubmission transition.

**`application_status` transitions** (self-service unless noted):
`draft → submitted`, `changes_requested → submitted` (resubmission) —
`submitted → changes_requested`, `submitted → rejected`,
`submitted → approved` (admin only). `rejected` is terminal for V1: no
transition leaves it. Nothing can reach `published` through
`application_status` — that value does not exist on this column;
publication is `profile_status` only.

**`profile_status` transitions:** applicant-writable only pre-review
(`draft`/`ready`, while `application_status` is
`draft`/`submitted`/`changes_requested`); admin-only from there —
`ready → published` (Publish, requires `application_status = 'approved'`
on both sides of the trigger check, not just `profile_status = 'ready'`,
which is ambiguous: submission itself also sets `profile_status =
'ready'`), `published → ready` (Unpublish), `ready`/`published →
suspended` (Suspend), `suspended → ready` (Restore — without this,
Suspend would be a one-way trap, not "minimal operational safety").
Approval (`application_status → approved`) always sets `profile_status =
'ready'` in the same statement — it can never set `published` in the same
step as approval; a second, separate admin action (Publish) is the only
way a profile becomes public. Confirmed live against PIVOTROOM-DEMO: an
admin update that tried to set `application_status = 'approved',
profile_status = 'published'` in one statement was entirely discarded by
the trigger, not partially applied.

**`profiles.role` is never written by anything in Phase 3.** Not on
submission, not on admin approval, not on publication, not by any RLS
policy or trigger branch added in `012`–`018`. An applicant's role stays
`customer` through every stage of the review lifecycle — expert capability
is represented entirely by `expert_profiles.application_status`/
`profile_status`, exactly as it was in Phase 2. There is no self-service
or API path to become an admin either (see "Promoting an admin" above).

**Optimistic concurrency:** every admin review/publish server action
(`lib/admin/actions.ts`) includes the expected *current* status in its
`UPDATE ... WHERE` clause (e.g. `.eq("application_status", "submitted")`)
and checks the affected-row count, not just whether the query errored. If
another admin already acted on the same application between page load and
this click, zero rows match and the caller gets a controlled "this
application's status changed" message — never a silent no-op, and never a
stale write.

**Public data exposure** goes exclusively through the 3 views in
`016_public_expert_views.sql`, never direct table access — `anon` has zero
grants on `expert_profiles`/`profiles`/`expert_profile_categories`/
`expert_session_types` (confirmed live: `select count(*)` against each,
as `anon`, returns 0 on every one). Each view's column list is a hard
allowlist with no `id`, `user_id`, email, phone, `review_message`,
`reviewed_*`/`approved_*`/`published_*`, or `account_status`/`role` —
confirmed live by listing `information_schema.columns` for all three
views. A view's default (non-`security_invoker`) behavior — running with
the view owner's privileges rather than the querying role's — is what
lets these read through RLS-protected tables at all; the WHERE clause
(`profile_status = 'published'`) and the column list together are the
entire exposure boundary. Supabase's security advisor flags this pattern
as `security_definer_view` (ERROR level) on all three views — reviewed
and accepted: it is the mechanism the Postgres/Supabase docs describe for
exactly this use case, and switching to `security_invoker` would require
granting `anon` much broader, riskier direct RLS access to the base
tables instead.

## Expert Availability (Phase 4 — monthly model)

Answers only "WHEN is this expert generally available?" — separate from
session pricing (Phase 2: what/how much) and a future booking phase
(which exact appointment times are currently bookable, after subtracting
real bookings). `/expert/availability` is expert-only, not part of the
Phase 2/3 application flow — it does not appear in `ExpertApplicationNav`
and is not part of application completeness, submission, approval, or
publishing validation. It is reachable from the Overview page once an
expert is approved, published, or suspended (all three keep
`application_status = 'approved'`).

**Product model:** Pivotroom is not asking "what hours do you work every
week" — it's asking an expert to give Pivotroom roughly 1-5 hours a
month, on whatever cadence works for them: a recurring monthly slot (e.g.
"first Monday, 3-4 PM"), a one-time specific date, or both. The UI
deliberately avoids "Working Hours"/"Business Hours" language throughout.

**Authorization** (two layers, unchanged from the original Phase 4
design): `requireApprovedExpertPage()` (`lib/availability/data.ts`)
redirects an unauthenticated visitor to login and anyone whose own
`expert_profiles.application_status` isn't `'approved'` to
`/expert/application` — draft/submitted/changes_requested/rejected never
see any availability UI or error detail. RLS
(`024_expert_monthly_availability_rls.sql` for the two new tables,
`020_expert_availability_rls.sql` still governing the reused settings/
unavailable-dates tables) holds even if that check had a bug: every row
is additionally scoped to `ep.user_id = auth.uid() and
ep.application_status = 'approved'` at the database level.

**Ownership without a client-supplied ID:** every write goes through a
`SECURITY DEFINER` RPC that resolves the caller's own approved
`expert_profile_id` from `auth.uid()` internally
(`resolve_own_approved_expert_profile_id()`, not itself exposed as a
callable RPC — kept unchanged from the original Phase 4). The client
never sends an `expert_profile_id` or `user_id` — there is nothing to
spoof. Confirmed live: an admin account with no expert profile of its
own gets "No approved expert profile found" from every write RPC, even
though that same account has full read access to every expert's
schedule via the admin RLS policy.

**Monthly recurrence:** `week_of_month` (`first`/`second`/`third`/
`fourth`/`last`) + `day_of_week` (1 = Monday … 7 = Sunday) + local
`start_time`/`end_time`. One row represents the rule for *all* future
months — never a per-month or per-date row (spec section 8: no
pre-generated occurrences). `nth_weekday_of_month()` /
`is_last_weekday_of_month()` / `monthly_rule_matches_date()`
(`025_expert_monthly_availability_functions.sql`) resolve a rule to an
actual calendar date only when asked, and are mirrored exactly in
`lib/availability/engine.ts` (`getNthWeekdayOfMonth`/
`isLastWeekdayOfMonth`/`doesDateMatchMonthlyRule`) for client-side instant
feedback — both sides live-tested against September 2026 (a 4-Monday
month, where "fourth" and "last" land on the same date, 2026-09-28) and
March 2026 (a 5-Monday month, where they land on different dates,
2026-03-23 vs. 2026-03-30) and produce identical results.

**One-off (specific-date) availability:** a single non-repeating
`available_date` + local time window (`expert_one_off_availability`).
Exists for an expert who can't commit to the same day every month but
can still offer Pivotroom a couple of hours this month — a first-class
V1 method alongside recurring rules, not a fallback.

**5-hour monthly cap:** `add/update_expert_monthly_rule()` sum every
existing rule's duration (excluding the rule being edited, for updates)
and reject if adding the candidate would exceed 300 minutes — live-tested
at the exact boundary (300 minutes allowed, one more 15-minute rule on
top of exactly 300 rejected). Derived by summing durations, not stored as
a separate value. One-off availability is **not** capped — informational
only, shown as part of "this month's total," which may exceed 5 hours
(spec section 18's documented simplification).

**Overlap protection**, all live-tested:
- *Recurring vs. recurring*: same expert, same `day_of_week`, and the
  same "recurrence bucket" (`week_of_month` equal, OR both are
  `fourth`/`last` — since those can resolve to the identical calendar
  date), with intersecting times → rejected. A `third Friday` rule with
  the identical time as an existing `fourth Friday` rule is **not**
  rejected — different buckets, confirmed live.
- *One-off vs. one-off*: same expert, same `available_date`, intersecting
  times → rejected.
- *One-off vs. recurring*: rejected if any recurring rule actually
  resolves to that specific date with an intersecting time (checked via
  `monthly_rule_matches_date()`) — confirmed live using 2026-10-05, the
  real first Monday of October 2026. Adjacent windows (no time overlap)
  are allowed in every direction.
- Enforced at two layers for the two new tables: inside the RPC (checked
  before any write, giving one clean error) and a `BEFORE INSERT OR
  UPDATE` trigger on `expert_monthly_availability_rules`/`expert_one_off_
  availability` as a backstop independent of the RPC.

**Timezone:** stored as a full IANA identifier (e.g.
`Africa/Addis_Ababa`), never a fixed UTC offset — offsets drift under
DST, IANA zones don't. Validated server-side by
`set_expert_availability_timezone()` (`026_expert_availability_timezone_
function.sql`) and again by the table-level `validate_iana_timezone()`
trigger (kept unchanged from the original Phase 4, since
`expert_availability_settings` itself never changed). First-time UX tries
`Intl.DateTimeFormat().resolvedOptions().timeZone` in the browser, falling
back to `Africa/Addis_Ababa` if detection fails — never inferred from
country/city, no geocoding, and always changeable.

**Skip a date:** `expert_unavailable_dates` — reused unchanged from the
original Phase 4 (same table, same `add_expert_unavailable_date()`/
`remove_expert_unavailable_date()` RPCs). A skipped date overrides BOTH
recurring monthly rules and one-off availability for that date; the
recurring rule continues normally in other months. `UNIQUE(expert_
profile_id, unavailable_date)` prevents duplicates at the database level.

**Storage efficiency:** no future appointment-slot rows and no per-month
occurrence rows are ever generated or stored anywhere in this codebase.
Availability stays purely rule-based — a handful of rule/date rows per
expert, regardless of how far into the future a booking engine eventually
needs to look.

**Future booking-engine compatibility:** `getRawAvailabilityForLocalDate(rules,
oneOffs, unavailableDates, localDate)` (`lib/availability/engine.ts`) is a
pure function — no I/O, no React, no Supabase client — that answers "for
this expert, on this local date, what raw availability exists," applying
the documented precedence (skip date wins outright; otherwise matching
recurring rules plus any one-off on that date are combined). Verified
against the spec's own example: "first Monday, 15:00-16:00" resolves to
that window on 2026-11-02, returns nothing on 2026-10-05 once that date
is marked unavailable. `getAvailabilityMinutesForMonth()` derives a whole
month's total by iterating every date in it through the same function —
no duplicate logic, no booking subtraction (none exist yet).

## Development-only test routes

Two routes exist purely to manually verify RLS with a real logged-in
session, using the normal authenticated Supabase client (never
`SUPABASE_SERVICE_ROLE_KEY`, which would bypass RLS and make the test
meaningless). Both are hard-guarded to 404 when `NODE_ENV === "production"`
and should be deleted once no longer needed:

- `/dev/rls-test` — Phase 1 (profiles/customer_profiles isolation).
- `/dev/expert-rls-test` — Phase 2 (expert_profiles/categories/sessions
  isolation, storage isolation, and the self-approval/publish/role-escalation
  tests).

## Project structure

```
app/
  page.tsx                          landing page
  auth/{signup,login,forgot-password,reset-password,callback}/
  dashboard/{layout.tsx,profile/page.tsx}       customer profile (Phase 1)
  become-an-expert/page.tsx                     public expert entry point
  expert/
    layout.tsx                                  shared header for /expert/*
    application/
      page.tsx                                  status, checklist, submit
      profile/page.tsx                           identity + bio + photo
      expertise/page.tsx                         category picker
      sessions/page.tsx                          session offerings CRUD
      preview/page.tsx                           owner-only public-profile preview (Phase 3)
    availability/page.tsx                         monthly availability + skip dates (Phase 4, approved-expert-only)
  admin/                                         admin-only, Phase 3
    layout.tsx                                   requireAdminPage() + AdminHeader
    page.tsx                                     redirects to /admin/experts
    experts/
      page.tsx                                   tabbed review queue + search
      [id]/page.tsx                               full application + review actions
  experts/                                        public marketplace, Phase 3
    page.tsx                                       directory (published experts only)
    [slug]/page.tsx                                 public profile (published only, else 404)
  dev/{rls-test,expert-rls-test}/                temporary, local only
components/
  ui/          Button, TextField, TextareaField, SelectField, FormMessage
  auth/        signup/login/forgot/reset forms
  profile/     ProfileForm (customer)
  expert/      ExpertProfileForm, PhotoUpload, CategoryPicker,
               AddSessionForm, SessionOfferingRow, SubmitApplicationPanel,
               PublicProfileView (shared by /experts/[slug] and the preview page),
               AvailabilityManager (monthly rules + one-off dates, Phase 4),
               UnavailableDatesManager (skip dates, Phase 4)
  admin/       AdminActionButton, AdminMessageForm (Phase 3 review actions)
  layout/      AuthShell, DashboardHeader, ExpertApplicationNav, AdminHeader
lib/
  supabase/    browser client, server client, proxy session-refresh helper
  auth/        server actions (signUp/signIn/signOut/reset), error mapping
  profile/     server action to save personal + professional profile
  expert/      actions.ts (application flow), data.ts (reads + completion
               checklist, incl. the by-id loader admin/preview reuse), slug.ts
  admin/       data.ts (requireAdminPage/requireAdminForAction, expert list/
               detail reads), actions.ts (review + publish server actions)
  public/      data.ts (public directory/profile reads through the 3 views,
               plus the owner-preview data converter)
  availability/  data.ts (requireApprovedExpertPage + reads), actions.ts
                  (RPC wrappers for the monthly/one-off/timezone/skip-date
                  RPCs), engine.ts (pure calculation logic -- monthly
                  recurrence math, overlap/cap checks, no I/O, no React)
  validation/  shared field validators (profile.ts, expert.ts)
  utils/       phone normalization
types/
  database.ts  generated from the Supabase schema
  profile.ts   customer domain types
  expert.ts    expert domain types (experience ranges, session durations,
               application/profile status labels, public view row types)
  availability.ts  week-of-month/weekday numbering + labels, default
                    timezone, the 1-5 hour cap constants, rule/one-off shapes
supabase/
  migrations/  schema, in order (001-004 Phase 1, 005-011 Phase 2,
               012-018 Phase 3, 019-026 Phase 4 -- 019-021 the original
               weekly model, 022 retires it, 023-026 the monthly model)
  seed.sql     industries + expertise categories
proxy.ts       Next.js 16's renamed middleware convention (route protection
               + session refresh) — protects /dashboard, /expert, /dev,
               /admin, and /auth/reset-password; additionally checks
               profiles.role for /admin (layer 1 of 3 -- see "Row Level
               Security")
```

## Application + review flow (Phase 3)

```
customer (existing or new) -> /become-an-expert -> Apply
    -> (signup/login if needed, returning to the application afterward)
    -> /expert/application  (draft auto-created, profiles.role stays customer)
    -> fill in profile / expertise / sessions, in any order, saved as you go
    -> Submit Application (blocked until every required item is complete)
    -> application_status = submitted, submitted_at set, profile_status = ready
    -> still profiles.role = customer

admin (/admin/experts, Submitted tab) -> open application -> /admin/experts/[id]
    -> Request Changes (message required)
         -> application_status = changes_requested
         -> applicant sees the message on Overview, edits, Resubmit
         -> application_status = submitted again (same row, same id)
    -> or Reject (reason required)
         -> application_status = rejected (terminal for V1)
         -> applicant sees a safe customer-facing message only
    -> or Approve (re-validates completeness server-side, not just the UI)
         -> application_status = approved, profile_status = ready
         -> still profiles.role = customer -- approval never auto-publishes

admin (/admin/experts, Approved tab) -> Publish (re-validates: approved,
complete, >=1 category, >=1 active duration, >=1 format, has a slug)
    -> profile_status = published
    -> still profiles.role = customer
    -> now visible at /experts (directory) and /experts/[slug] (profile)

admin -> Unpublish (published -> ready) / Suspend (ready or published ->
suspended) / Restore (suspended -> ready) -- minimal operational controls,
all reversible except Reject.
```

## Expert Availability engine + review flow (Phase 4 — monthly model)

```
approved/published/suspended expert -> Overview -> "Set Availability" /
"Manage Availability" -> /expert/availability
    -> choose timezone (IANA identifier; browser-detected default,
       Africa/Addis_Ababa fallback) -> set_expert_availability_timezone()
    -> "+ Add Availability" -> choose Repeats Monthly or Specific Date
         Repeats Monthly: week-of-month + weekday + start/end time, on a
           15-minute grid -> add_expert_monthly_rule() (5-hour cap +
           overlap, incl. the fourth/last bucket, checked before write)
         Specific Date: a calendar date + start/end time ->
           add_expert_one_off_availability() (checked against other
           one-offs on that date AND any recurring rule that resolves to
           that date)
    -> Edit/Remove any rule or one-off individually ->
       update/remove_expert_monthly_rule() /
       update/remove_expert_one_off_availability() -- editing updates the
       same row, never creates a duplicate
    -> Monthly Time summary: recurring minutes/month (derived by summing
       rule durations), plus this month's total including one-offs
    -> "Skip a Date" -> add/remove_expert_unavailable_date() -- overrides
       both recurring rules and one-offs for that one date; the recurring
       rule continues normally in other months
    -> everything persists across refresh/logout/login (it's just rows,
       read back through RLS-scoped SELECTs)
    -> still profiles.role = customer, still application_status =
       approved, still profile_status whatever it already was --
       availability never touches any of the three
```

No booking calendar, no customer-facing time picker, no pre-generated
slot or per-month occurrence rows, no bookings table anywhere in this
codebase yet -- see "Explicitly not implemented" below.

## Explicitly not implemented (future phases)

Bookings, booking intake/reschedule/cancel, booking dashboard, a
customer-facing date/time picker or calendar on the public expert profile
(still "Booking coming soon"), raw recurrence text ("first Monday every
month") shown on the public profile, pre-generated future appointment-
slot rows or per-month occurrence rows (availability stays rule-based),
booking conflict/subtraction logic (nothing to subtract yet -- no
bookings exist), per-expert minimum notice or booking-horizon settings,
buffer times, a generic RRULE/cron recurrence system or arbitrary
intervals (every 2 months, every 3 weeks, etc. -- V1 is exactly first/
second/third/fourth/last + weekday + time, nothing more), partial-day
date exceptions or date-specific *extra* hours beyond a rule/one-off
(skip dates are full-day only), overnight availability windows (configure
day-separated windows instead), an "accepting bookings" toggle, a hard
cap on one-off availability (informational only, spec-sanctioned
simplification), Chapa or manual payments, payment tables, tax/VAT
calculation,
commission, fees, payouts, earnings, Google Calendar/Outlook/Calendly/
Cal.com/Google Meet integration, notifications (email/WhatsApp), reviews,
ratings, testimonials, session/booking counts, badges, referrals,
gift-a-session, AI matching/generation/recommendations/search/chatbot,
community/messaging, analytics dashboards, CV/certificate uploads, a
review-events/history table (see "Database" above for why), an
"Unsuspend" step distinct from Restore, and an internal admin-notes
system separate from the one applicant-visible review message. Do not
assume any of this exists.
