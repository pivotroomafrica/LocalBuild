-- 023_expert_monthly_availability_tables.sql
-- Phase 4 adjustment: the monthly availability model. Migrations 001-022
-- are not modified. Two new tables, alongside the reused
-- expert_availability_settings (timezone) and expert_unavailable_dates
-- (full-day skip) from the retired weekly model (022).
--
--   expert_monthly_availability_rules -- "give Pivotroom this same
--     window every month" (e.g. "first Monday, 3-4 PM"). One row per
--     rule. Represents ALL future months -- no per-month rows, no
--     concrete calendar dates stored (spec sections 7-8).
--   expert_one_off_availability -- a specific calendar date that does
--     not repeat (spec sections 9-10) -- for an expert who can't commit
--     to the same day every month but can still offer a couple of hours
--     this month.
--
-- Neither table stores a pre-computed future occurrence -- "first Monday"
-- is stored as exactly that, a rule, and a future booking phase resolves
-- it to an actual date only when asked (spec section 8: "Do not
-- pre-generate occurrences").

-- =========================================================================
-- expert_monthly_availability_rules
-- =========================================================================

create table public.expert_monthly_availability_rules (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,

  -- V1 recurrence vocabulary is deliberately this small and closed --
  -- no generic RRULE/cron/every-N-weeks system (spec section 29).
  week_of_month text not null
    check (week_of_month in ('first', 'second', 'third', 'fourth', 'last')),

  -- ISO-style: 1 = Monday ... 7 = Sunday, same convention the retired
  -- weekly model used.
  day_of_week smallint not null check (day_of_week between 1 and 7),

  -- Local wall-clock time in the expert's timezone
  -- (expert_availability_settings.timezone) -- never converted to/stored
  -- as UTC here (spec section 43): a fixed UTC instant would silently
  -- break this recurring rule across a DST transition.
  start_time time not null,
  end_time time not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expert_monthly_rules_valid_range check (end_time > start_time),
  -- 15-minute grid (spec section 19), same reasoning as the retired
  -- weekly model: combined with end > start, this already guarantees a
  -- 15-minute minimum without a separate redundant length check.
  constraint expert_monthly_rules_start_grid check (
    date_part('minute', start_time)::int % 15 = 0 and date_part('second', start_time) = 0
  ),
  constraint expert_monthly_rules_end_grid check (
    date_part('minute', end_time)::int % 15 = 0 and date_part('second', end_time) = 0
  )
);

comment on table public.expert_monthly_availability_rules is
  'One row per recurring monthly availability rule (e.g. "first Monday, 15:00-16:00"), representing all future months -- never a per-month or per-date row. Local wall-clock time in the owning expert''s timezone.';

create index expert_monthly_rules_expert_day_idx
  on public.expert_monthly_availability_rules (expert_profile_id, day_of_week);

alter table public.expert_monthly_availability_rules enable row level security;

create trigger set_expert_monthly_rules_updated_at
  before update on public.expert_monthly_availability_rules
  for each row
  execute function public.set_updated_at();

-- Overlap prevention (spec section 28): two rules overlap if they land on
-- the same weekday and their local times intersect AND their
-- week_of_month values could resolve to the same actual date. "fourth"
-- and "last" are the special case -- in months where the weekday occurs
-- only 4 times, they land on the exact same date, so a "fourth Monday"
-- rule and a "last Monday" rule with overlapping times are treated as
-- conflicting even though their week_of_month text differs. This is the
-- table-level backstop; the add/update RPCs in 025 perform the same
-- check before writing, so a bad request never reaches this trigger
-- under normal operation.
create or replace function public.prevent_expert_monthly_rule_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.expert_monthly_availability_rules r
    where r.expert_profile_id = new.expert_profile_id
      and r.day_of_week = new.day_of_week
      and r.id is distinct from new.id
      and (
        r.week_of_month = new.week_of_month
        or (r.week_of_month in ('fourth', 'last') and new.week_of_month in ('fourth', 'last'))
      )
      and r.start_time < new.end_time
      and r.end_time > new.start_time
  ) then
    raise exception 'This availability overlaps an existing monthly rule.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger prevent_expert_monthly_rules_overlap
  before insert or update on public.expert_monthly_availability_rules
  for each row
  execute function public.prevent_expert_monthly_rule_overlap();

revoke execute on function public.prevent_expert_monthly_rule_overlap() from public, anon, authenticated;

-- =========================================================================
-- expert_one_off_availability
-- =========================================================================

create table public.expert_one_off_availability (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,

  -- A specific calendar date -- this availability exists once and is
  -- never automatically repeated (spec section 9).
  available_date date not null,
  start_time time not null,
  end_time time not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expert_one_off_valid_range check (end_time > start_time),
  constraint expert_one_off_start_grid check (
    date_part('minute', start_time)::int % 15 = 0 and date_part('second', start_time) = 0
  ),
  constraint expert_one_off_end_grid check (
    date_part('minute', end_time)::int % 15 = 0 and date_part('second', end_time) = 0
  )
);

comment on table public.expert_one_off_availability is
  'A specific, non-repeating calendar date of availability -- for an expert who cannot commit to the same day every month. Local wall-clock time in the owning expert''s timezone.';

create index expert_one_off_availability_expert_date_idx
  on public.expert_one_off_availability (expert_profile_id, available_date);

alter table public.expert_one_off_availability enable row level security;

create trigger set_expert_one_off_availability_updated_at
  before update on public.expert_one_off_availability
  for each row
  execute function public.set_updated_at();

-- Overlap prevention within the same date (spec section 27's "one-off vs
-- one-off" case). The "one-off vs recurring" case is checked by the RPCs
-- in 025 at write time (it requires resolving whether a recurring rule
-- lands on this specific date, which needs the date-arithmetic helper
-- functions defined there) -- not expressible as a plain table trigger
-- here without duplicating that logic, so it isn't duplicated.
create or replace function public.prevent_expert_one_off_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.expert_one_off_availability o
    where o.expert_profile_id = new.expert_profile_id
      and o.available_date = new.available_date
      and o.id is distinct from new.id
      and o.start_time < new.end_time
      and o.end_time > new.start_time
  ) then
    raise exception 'This availability overlaps existing availability on that date.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger prevent_expert_one_off_availability_overlap
  before insert or update on public.expert_one_off_availability
  for each row
  execute function public.prevent_expert_one_off_overlap();

revoke execute on function public.prevent_expert_one_off_overlap() from public, anon, authenticated;
