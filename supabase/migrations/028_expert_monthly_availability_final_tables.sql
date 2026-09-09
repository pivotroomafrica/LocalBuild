-- 028_expert_monthly_availability_final_tables.sql
-- Phase 4 final availability model. Migrations 001-027 are not modified.
--
-- Final active model (spec section 15): day-of-month recurring rules +
-- per-occurrence overrides + one-off availability. This migration adds
-- the two new/changed tables; RLS is 029, functions are 030.
--
--   expert_monthly_availability_rules -- "the regular plan": a day of
--     the month (1-28) + local time window, representing every future
--     month until changed. Replaces the retired week_of_month/
--     day_of_week shape (027).
--   expert_availability_overrides -- a change to ONE specific month's
--     occurrence of a recurring rule, without touching the rule itself:
--     'modified' (moved to a different date/time) or 'skipped' (removed
--     for that month only). The base rule is never rewritten just
--     because one month differs (spec section 9).
--
-- expert_availability_settings (timezone) and expert_one_off_availability
-- are unchanged -- not touched by this migration.

-- =========================================================================
-- expert_monthly_availability_rules (final shape)
-- =========================================================================

create table public.expert_monthly_availability_rules (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,

  -- 1-28 only (spec section 5) -- every calendar month has a 28th, so a
  -- rule always has exactly one unambiguous occurrence per month with no
  -- "there's no Feb 30" edge case to handle. Specific-date (one-off)
  -- availability is not bound by this -- it can use any real calendar
  -- date.
  day_of_month smallint not null check (day_of_month between 1 and 28),

  -- Local wall-clock time in the expert's timezone
  -- (expert_availability_settings.timezone) -- never converted to/stored
  -- as UTC (spec section 23): a fixed UTC instant would silently break
  -- this recurring rule across a DST transition.
  start_time time not null,
  end_time time not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expert_monthly_rules_valid_range check (end_time > start_time),
  -- 15-minute grid (spec section 24), same reasoning as every prior
  -- availability table in this codebase: combined with end > start, this
  -- already guarantees a 15-minute minimum without a separate check.
  constraint expert_monthly_rules_start_grid check (
    date_part('minute', start_time)::int % 15 = 0 and date_part('second', start_time) = 0
  ),
  constraint expert_monthly_rules_end_grid check (
    date_part('minute', end_time)::int % 15 = 0 and date_part('second', end_time) = 0
  )
);

comment on table public.expert_monthly_availability_rules is
  'The expert''s regular monthly plan: a day-of-month (1-28) + local time window, representing every future month until changed or removed. A specific month can still be changed without touching this row -- see expert_availability_overrides.';

create index expert_monthly_rules_expert_day_idx
  on public.expert_monthly_availability_rules (expert_profile_id, day_of_month);

alter table public.expert_monthly_availability_rules enable row level security;

create trigger set_expert_monthly_rules_updated_at
  before update on public.expert_monthly_availability_rules
  for each row
  execute function public.set_updated_at();

-- Overlap prevention (spec section 26, "recurring vs recurring"): two
-- rules on the SAME day-of-month with intersecting local times conflict
-- -- unlike the retired week-of-month model, there is no "bucket"
-- ambiguity to reason about here, since day-of-month is an exact integer.
-- This is the table-level backstop; the add/update RPCs in 030 perform
-- the same check before writing, so a bad request never reaches this
-- trigger under normal operation.
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
      and r.day_of_month = new.day_of_month
      and r.id is distinct from new.id
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
-- expert_availability_overrides
-- =========================================================================

create table public.expert_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  recurring_rule_id uuid not null references public.expert_monthly_availability_rules (id) on delete cascade,

  -- The calendar date of the base rule's UNMODIFIED occurrence being
  -- overridden for one month (e.g. 2026-10-15 for a "15th" rule in
  -- October) -- this is the lookup key an occurrence is overridden
  -- through, not itself a new time.
  original_date date not null,

  override_type text not null check (override_type in ('modified', 'skipped')),

  -- Only set when override_type = 'modified' -- the occurrence's new
  -- date/time for that one month. Null for 'skipped': there is nothing
  -- to move it to, the occurrence simply doesn't happen that month (spec
  -- section 10).
  override_date date,
  start_time time,
  end_time time,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- At most one override per (rule, original occurrence) -- an
  -- occurrence is either modified or skipped, never both, and creating a
  -- second override for the same occurrence should replace the first,
  -- not add a conflicting second row (the RPCs in 030 upsert on this).
  constraint expert_availability_overrides_unique unique (recurring_rule_id, original_date),

  constraint expert_availability_overrides_modified_fields check (
    (override_type = 'skipped' and override_date is null and start_time is null and end_time is null)
    or (override_type = 'modified' and override_date is not null and start_time is not null and end_time is not null)
  ),
  constraint expert_availability_overrides_valid_range check (
    override_type = 'skipped' or end_time > start_time
  ),
  constraint expert_availability_overrides_start_grid check (
    override_type = 'skipped'
    or (date_part('minute', start_time)::int % 15 = 0 and date_part('second', start_time) = 0)
  ),
  constraint expert_availability_overrides_end_grid check (
    override_type = 'skipped'
    or (date_part('minute', end_time)::int % 15 = 0 and date_part('second', end_time) = 0)
  )
);

comment on table public.expert_availability_overrides is
  'A change to ONE specific month''s occurrence of a recurring rule -- moved (modified) or removed (skipped) -- without rewriting the base rule. "Restore Regular Time" is just deleting the relevant row here (030); the base rule in expert_monthly_availability_rules is never touched by this table.';

create index expert_availability_overrides_expert_idx
  on public.expert_availability_overrides (expert_profile_id);

-- Supports "which modified occurrences land in month X" (spec section 7's
-- Upcoming Months rendering, and the cross-month-move case in section 16)
-- without scanning every override for every expert.
create index expert_availability_overrides_override_date_idx
  on public.expert_availability_overrides (expert_profile_id, override_date)
  where override_type = 'modified';

alter table public.expert_availability_overrides enable row level security;

create trigger set_expert_availability_overrides_updated_at
  before update on public.expert_availability_overrides
  for each row
  execute function public.set_updated_at();

-- No overlap-prevention trigger here (unlike the rules table above): an
-- override's effective conflict set spans multiple tables (other rules'
-- natural occurrences, other overrides, one-off availability) and is
-- already computed once, correctly, by expert_recurring_and_override_
-- windows_for_date() (030) inside set_expert_month_override() before any
-- write -- duplicating that same multi-table computation in a trigger
-- would not add a meaningfully independent safety layer here, since (per
-- 029) there is no direct write grant to this table at all: the RPC is
-- structurally the only path in.
