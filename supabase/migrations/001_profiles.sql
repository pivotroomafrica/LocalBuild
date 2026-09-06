-- 001_profiles.sql
-- Shared identity table. One row per Supabase Auth user (auth.users).
--
-- auth.users
--     |
--     v
-- profiles   <- this migration
--     |
--     v
-- customer_profiles (see 003_customer_profiles.sql)
--
-- Email is intentionally NOT duplicated here. Supabase Auth (auth.users)
-- already owns email as the authentication identity; reading it from the
-- authenticated session avoids a second copy that can drift out of sync.

-- Generic "keep updated_at current" trigger function, reused by every
-- table in this project that has an updated_at column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger functions are invoked by Postgres itself, never called directly
-- by API clients. Revoking EXECUTE from anon/authenticated keeps them out
-- of the PostgREST-exposed RPC surface (/rest/v1/rpc/...).
revoke execute on function public.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  full_name text not null,
  phone text,
  country text,
  city text,

  -- Role foundation for the future marketplace. Public signup can only ever
  -- produce 'customer' (enforced by handle_new_user() below, not by client
  -- input). 'expert' and 'admin' exist now so later phases don't need a
  -- destructive schema change, but nothing in Phase 1 grants them.
  role text not null default 'customer'
    check (role in ('customer', 'expert', 'admin')),

  -- Minimal account lifecycle. New customers are always 'active'; no UI to
  -- change this exists yet in Phase 1.
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'deleted')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint full_name_length check (
    char_length(trim(full_name)) between 1 and 100
  ),
  constraint phone_length check (phone is null or char_length(phone) <= 20),
  constraint country_length check (country is null or char_length(country) <= 100),
  constraint city_length check (city is null or char_length(city) <= 100)
);

comment on table public.profiles is
  'Shared identity for every Pivotroom account. Root of the profiles -> customer_profiles relationship. id = auth.users.id.';

alter table public.profiles enable row level security;
-- No policies here: this migration only defines the table. Policies for
-- customer access live in 004_customer_rls.sql, following the standard
-- Postgres default-deny behaviour of RLS with zero policies attached.

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-provision a profiles row whenever a new Supabase Auth user is
-- created. SECURITY DEFINER lets this run with the privileges of its
-- owner (postgres), bypassing RLS, which is required because the row must
-- be created before the new user has an authenticated session of their
-- own. full_name/phone come from the signup call's user metadata
-- (supabase.auth.signUp({ options: { data: { full_name, phone } } })).
--
-- A trigger exception aborts the auth.users insert too (they share one
-- transaction), so this must never fail. full_name falls back to the
-- email's local part if metadata is ever missing, which keeps it within
-- the full_name_length check instead of breaking signup outright.
--
-- on conflict do nothing makes this idempotent: it is not possible to
-- trigger it twice for the same user (auth.users.id is unique and the
-- trigger fires once per insert), but the guard costs nothing and keeps
-- the "no duplicate profiles" guarantee explicit rather than assumed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1),
      'Pivotroom Customer'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
