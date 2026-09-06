# Pivotroom

Expert marketplace where customers book paid one-to-one consultations with
experienced professionals.

**Current implemented milestone: Pivotroom V1 Phase 2 — Expert Application +
Expert Profile + Session Offerings.** Customers can also apply to become
experts (their application is not yet reviewed, approved, or public). Admin
approval, the public marketplace, availability, bookings, and payments are
not implemented — see "Explicitly not implemented" below.

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
| `SUPABASE_SERVICE_ROLE_KEY` | *(reserved)* | Not used by any Phase 1 or Phase 2 code — profile/expert-profile creation and every write run through the authenticated client under RLS, not privileged server code. Reserved for future admin/server-only operations (Phase 3). Never expose to the browser. |

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
- `009_expert_storage.sql` — creates the `expert-profile-images` Storage
  bucket (private, 3&nbsp;MB cap, image MIME types only).
- `010_expert_rls.sql` — RLS policies, column grants, and
  `protect_expert_profile_privileged_fields()` (blocks self-approval,
  self-rejection, self-publishing, and moving `user_id`) for every Phase 2
  table, plus Storage policies scoping each applicant to their own photo
  path (`<user_id>/profile-photo`).

`supabase/seed.sql` seeds the 17 industries and the 8 expertise categories.
It's separate from the migrations on purpose — schema vs. seed/demo data are
never mixed. Fake customer/applicant accounts are **not** seeded there
(inserting directly into `auth.users` bypasses Supabase Auth's password
machinery); create test accounts through the real `/auth/signup` flow
instead.

Apply migrations and seed via the Supabase Dashboard SQL editor, the
Supabase CLI (`supabase db push`), or the Supabase MCP tools, in the order
listed above.

Public application tables (7 total): `profiles`, `industries`,
`customer_profiles`, `expert_profiles`, `expert_categories`,
`expert_profile_categories`, `expert_session_types`. Supabase Auth's own
`auth.users` is the root identity; nothing here duplicates it. There is no
separate expert authentication system — an expert application is just
another row owned by an existing `auth.users`/`profiles` identity.

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
  dev/{rls-test,expert-rls-test}/                temporary, local only
components/
  ui/          Button, TextField, TextareaField, SelectField, FormMessage
  auth/        signup/login/forgot/reset forms
  profile/     ProfileForm (customer)
  expert/      ExpertProfileForm, PhotoUpload, CategoryPicker,
               AddSessionForm, SessionOfferingRow, SubmitApplicationPanel
  layout/      AuthShell, DashboardHeader, ExpertApplicationNav
lib/
  supabase/    browser client, server client, proxy session-refresh helper
  auth/        server actions (signUp/signIn/signOut/reset), error mapping
  profile/     server action to save personal + professional profile
  expert/      actions.ts (application flow), data.ts (reads + completion
               checklist), slug.ts
  validation/  shared field validators (profile.ts, expert.ts)
  utils/       phone normalization
types/
  database.ts  generated from the Supabase schema
  profile.ts   customer domain types
  expert.ts    expert domain types (experience ranges, session durations, ...)
supabase/
  migrations/  schema, in order (001-004 Phase 1, 005-010 Phase 2)
  seed.sql     industries + expertise categories
proxy.ts       Next.js 16's renamed middleware convention (route protection
               + session refresh) — protects /dashboard, /expert, /dev, and
               /auth/reset-password
```

## Application flow (Phase 2)

```
customer (existing or new) -> /become-an-expert -> Apply
    -> (signup/login if needed, returning to the application afterward)
    -> /expert/application  (draft auto-created, profiles.role stays customer)
    -> fill in profile / expertise / sessions, in any order, saved as you go
    -> Submit Application (blocked until every required item is complete)
    -> application_status = submitted, submitted_at set
    -> still profiles.role = customer -- admin approval is Phase 3
```

## Explicitly not implemented (future phases)

Admin dashboard, admin approval/rejection UI, public expert marketplace,
expert search, public expert profile pages, availability, calendars,
bookings, booking intake, Chapa or manual payments, payment tables, payouts,
earnings, Google Meet/Calendar integration, customer booking dashboard,
notifications (email/WhatsApp), reviews, ratings, referrals, gift-a-session,
AI matching, community/messaging, analytics dashboards, CV/certificate
uploads. Do not assume any of this exists.
