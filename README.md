# Pivotroom

Expert marketplace where customers book paid one-to-one consultations with
experienced professionals.

**Current implemented milestone: Pivotroom V1 Phase 1 — Local Foundation +
Customer Account System.** Only customer signup/login/profile exists.
Experts, admins, marketplace, availability, bookings, and payments are not
implemented — see "Explicitly not implemented" below.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind v4) + Supabase (Auth, Postgres,
RLS).

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
| `SUPABASE_SERVICE_ROLE_KEY` | *(reserved)* | Not used by any Phase 1 code — profile creation runs through a database trigger, not privileged server code. Reserved for future admin/server-only operations. Never expose to the browser. |

## Supabase (PIVOTROOM-DEMO)

This phase connects only to a demo/dev Supabase project (`PIVOTROOM-DEMO`),
containing fake data only. Never point `.env.local` at a production project.

**Manual Supabase Dashboard configuration required:**

- **Auth → URL Configuration**: set Site URL to `http://localhost:3000` and
  add `http://localhost:3000/**` to the redirect URL allowlist, so email
  confirmation and password-reset links work locally.
- **Auth → Providers → Email**: by default new Supabase projects require
  email confirmation before login. The signup form already handles both
  cases (shows "check your email" or logs the customer in immediately), but
  if you want instant login during local testing, turn "Confirm email" off.

## Database

Schema lives entirely in `supabase/migrations/`, applied in order:

- `001_profiles.sql` — the `profiles` table (shared identity, one row per
  `auth.users`), the `handle_new_user()` trigger that creates it on signup,
  and the reusable `set_updated_at()` trigger function.
- `002_industries.sql` — the `industries` lookup table.
- `003_customer_profiles.sql` — the `customer_profiles` table (customer
  professional profile, unique per customer).
- `004_customer_rls.sql` — Row Level Security policies, column-level
  privilege grants, and the `protect_privileged_profile_fields()` trigger
  that blocks role/account_status escalation.

`supabase/seed.sql` seeds the 17 industries. It's separate from the
migrations on purpose — schema vs. seed/demo data are never mixed. Fake
customer accounts are **not** seeded there (inserting directly into
`auth.users` bypasses Supabase Auth's password machinery); create test
customers through the real `/auth/signup` flow instead.

Apply migrations and seed via the Supabase Dashboard SQL editor, the
Supabase CLI (`supabase db push`), or the Supabase MCP tools, in the order
listed above.

Tables: `profiles`, `industries`, `customer_profiles`. That's it — Supabase
Auth's own `auth.users` is the root identity; nothing here duplicates it.

## Project structure

```
app/
  page.tsx                    landing page
  auth/{signup,login,forgot-password,reset-password,callback}/
  dashboard/{layout.tsx,profile/page.tsx}
components/
  ui/          Button, TextField, SelectField, FormMessage
  auth/        signup/login/forgot/reset forms
  profile/     ProfileForm
  layout/      AuthShell, DashboardHeader
lib/
  supabase/    browser client, server client, proxy session-refresh helper
  auth/        server actions (signUp/signIn/signOut/reset), error mapping
  profile/     server action to save personal + professional profile
  validation/  shared field validators
  utils/       phone normalization
types/
  database.ts  generated from the Supabase schema
  profile.ts   hand-written domain types (EmploymentType, ExperienceRange, ...)
supabase/
  migrations/  schema, in order
  seed.sql     industries seed data
proxy.ts       Next.js 16's renamed middleware convention (route protection
               + session refresh)
```

## Explicitly not implemented (future phases)

Expert accounts, admin dashboard, expert marketplace/search/categories,
session pricing, availability, booking, Chapa or manual payments, meeting
links, notifications (email/WhatsApp), reviews, referrals, messaging, AI
matching, wallet/loyalty, analytics, profile pictures, CV/certificate
uploads. Do not assume any of this exists.
