-- 003_customer_profiles.sql
-- Customer professional profile. Deliberately narrow scope: enough for an
-- expert to understand who they're talking to, nothing that belongs to a
-- future booking (see spec section 13 for the fields intentionally
-- excluded, e.g. business_stage / "what are you trying to achieve").
--
-- profiles
--     |
--     v
-- customer_profiles   <- this migration (max ONE row per customer)

create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),

  -- One customer_profiles row per customer, enforced at the database level
  -- (unique constraint below), not just in application code.
  user_id uuid not null unique references public.profiles (id) on delete cascade,

  -- Quoted because "current_role" is a reserved SQL keyword (a session
  -- variable expression) in Postgres, not because of any styling choice.
  "current_role" text,
  employment_type text
    check (employment_type is null or employment_type in (
      'founder_owner',
      'executive_manager',
      'employee',
      'freelancer_consultant',
      'student',
      'between_roles',
      'other'
    )),
  company_name text,
  industry_id uuid references public.industries (id),
  years_experience_range text
    check (years_experience_range is null or years_experience_range in (
      'student_none',
      'lt_1',
      '1_3',
      '4_6',
      '7_10',
      '11_15',
      '15_plus'
    )),
  linkedin_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint current_role_length check (
    "current_role" is null or char_length("current_role") <= 100
  ),
  constraint company_name_length check (
    company_name is null or char_length(company_name) <= 150
  ),
  constraint linkedin_url_format check (
    linkedin_url is null or (
      char_length(linkedin_url) <= 300
      and linkedin_url ~* '^https?://([a-z]{2,3}\.)?linkedin\.com/.+$'
    )
  )
);

comment on table public.customer_profiles is
  'Customer professional profile. user_id is unique: at most one row per customer, enforced by the database.';

-- user_id already has a unique index from the constraint above, which also
-- serves as the lookup index for "load the current customer's profile".
create index customer_profiles_industry_id_idx on public.customer_profiles (industry_id);

alter table public.customer_profiles enable row level security;
-- Policies live in 004_customer_rls.sql.

create trigger set_customer_profiles_updated_at
  before update on public.customer_profiles
  for each row
  execute function public.set_updated_at();
