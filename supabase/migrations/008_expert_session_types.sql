-- 008_expert_session_types.sql
-- An expert's consultation offerings -- their BASE session price per
-- duration. This is not a payment table: no commission, VAT, transaction
-- fees, withholding, or payout math belongs here or anywhere in Phase 2.

create table public.expert_session_types (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,

  duration_minutes integer not null
    check (duration_minutes in (15, 30, 45, 60, 90)),

  -- Exact monetary type, never floating point.
  base_price numeric(12, 2) not null check (base_price > 0),
  currency text not null default 'ETB',

  online_enabled boolean not null default false,
  in_person_enabled boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- V1: one offering per duration per expert (no "two different 30-minute
  -- products" yet).
  constraint expert_session_types_unique_duration unique (expert_profile_id, duration_minutes),
  constraint expert_session_types_currency_length check (char_length(currency) between 1 and 10),
  -- Every offering must support at least one session format.
  constraint expert_session_types_has_format check (online_enabled or in_person_enabled)
);

comment on table public.expert_session_types is
  'Expert base session offerings (duration + price + format). No commission/fee/payout math -- that belongs to a future payments phase.';

alter table public.expert_session_types enable row level security;
-- Policies live in 010_expert_rls.sql.

create trigger set_expert_session_types_updated_at
  before update on public.expert_session_types
  for each row
  execute function public.set_updated_at();
