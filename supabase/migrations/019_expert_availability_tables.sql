-- 019_expert_availability_tables.sql
-- Phase 4: expert availability engine. Purely additive on top of
-- expert_profiles (005_expert_profiles.sql) -- migrations 001-018 are not
-- modified. Answers only "WHEN is this expert generally available?" --
-- session pricing (what/how much, Phase 2) and booking (which exact slot,
-- a future phase) stay separate systems.
--
-- Three tables, one responsibility each (spec section 22): a rule-based
-- model, never pre-generated future slot rows (spec section 3/44).
--
--   expert_availability_settings -- one row per expert: timezone.
--   expert_availability_windows  -- recurring weekly schedule, local
--                                    wall-clock time in that timezone.
--   expert_unavailable_dates     -- specific full-day exceptions that
--                                    override the recurring schedule.
--
-- RLS, RPC-only writes, and grants are added in the next two migrations
-- (020, 021) -- this migration only defines shape and the constraints/
-- triggers that must hold no matter which layer ends up writing.

-- =========================================================================
-- expert_availability_settings
-- =========================================================================

create table public.expert_availability_settings (
  -- One settings row per expert, keyed directly by expert_profile_id (not
  -- a separate id + unique constraint) -- there is no scenario where an
  -- expert has more than one settings row, so a surrogate key would only
  -- add an unnecessary extra uniqueness constraint to maintain.
  expert_profile_id uuid primary key references public.expert_profiles (id) on delete cascade,

  -- Full IANA identifier (e.g. "Africa/Addis_Ababa"), never a fixed UTC
  -- offset -- offsets drift under DST, IANA zones don't (spec section 9).
  -- Validated against pg_timezone_names by a trigger below (a CHECK
  -- constraint cannot reference another relation) and again by the
  -- save_expert_availability_schedule() RPC (021) before this row is
  -- ever touched.
  timezone text not null default 'Africa/Addis_Ababa',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.expert_availability_settings is
  'One row per expert: their IANA timezone. Weekly windows (expert_availability_windows) store local wall-clock time interpreted in this zone.';

alter table public.expert_availability_settings enable row level security;

create trigger set_expert_availability_settings_updated_at
  before update on public.expert_availability_settings
  for each row
  execute function public.set_updated_at();

create or replace function public.validate_iana_timezone()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function public.validate_iana_timezone() is
  'Table-level backstop (spec section 11): only a real IANA zone name from pg_timezone_names may ever land in expert_availability_settings.timezone, regardless of which layer writes the row. save_expert_availability_schedule() (021) checks the same thing before it gets here -- this is defense in depth, not the only check.';

create trigger validate_expert_availability_settings_timezone
  before insert or update on public.expert_availability_settings
  for each row
  execute function public.validate_iana_timezone();

revoke execute on function public.validate_iana_timezone() from public, anon, authenticated;

-- =========================================================================
-- expert_availability_windows
-- =========================================================================

create table public.expert_availability_windows (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,

  -- ISO-style: 1 = Monday ... 7 = Sunday (spec section 19).
  day_of_week smallint not null check (day_of_week between 1 and 7),

  -- Local wall-clock time in the expert's timezone (expert_availability_
  -- settings.timezone) -- never converted to/stored as UTC here. See
  -- spec section 35: converting a recurring rule to a fixed UTC instant
  -- would silently break across DST transitions.
  start_time time not null,
  end_time time not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expert_availability_windows_valid_range check (end_time > start_time),
  -- 15-minute grid (spec section 15) -- combined with end > start above,
  -- this already guarantees a minimum 15-minute window (spec section 16)
  -- without a separate, redundant length check: the smallest possible
  -- gap between two distinct 15-minute-aligned times is exactly 15
  -- minutes.
  constraint expert_availability_windows_start_grid check (
    date_part('minute', start_time)::int % 15 = 0 and date_part('second', start_time) = 0
  ),
  constraint expert_availability_windows_end_grid check (
    date_part('minute', end_time)::int % 15 = 0 and date_part('second', end_time) = 0
  )
);

comment on table public.expert_availability_windows is
  'Recurring weekly availability. Local wall-clock time in the owning expert''s timezone. Multiple rows per day are allowed (e.g. a lunch-break split). No overlap for the same expert/day -- enforced by a trigger below, checked again by save_expert_availability_schedule() (021) for the whole incoming batch at once.';

create index expert_availability_windows_expert_day_idx
  on public.expert_availability_windows (expert_profile_id, day_of_week);

alter table public.expert_availability_windows enable row level security;

create trigger set_expert_availability_windows_updated_at
  before update on public.expert_availability_windows
  for each row
  execute function public.set_updated_at();

-- Overlap prevention (spec section 17): adjacent windows (12:00-12:00
-- boundary) are allowed -- the strict `<`/`>` comparison below only
-- rejects a genuine overlap, not a shared boundary. This is the
-- table-level backstop; save_expert_availability_schedule() (021) also
-- validates the whole incoming batch pairwise before writing anything, so
-- a bad request never reaches this trigger in the first place under
-- normal operation -- this exists in case any future write path bypasses
-- that RPC.
create or replace function public.prevent_expert_availability_window_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.expert_availability_windows w
    where w.expert_profile_id = new.expert_profile_id
      and w.day_of_week = new.day_of_week
      and w.id is distinct from new.id
      and w.start_time < new.end_time
      and w.end_time > new.start_time
  ) then
    raise exception 'Availability windows overlap for this day.' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger prevent_expert_availability_windows_overlap
  before insert or update on public.expert_availability_windows
  for each row
  execute function public.prevent_expert_availability_window_overlap();

revoke execute on function public.prevent_expert_availability_window_overlap() from public, anon, authenticated;

-- =========================================================================
-- expert_unavailable_dates
-- =========================================================================

create table public.expert_unavailable_dates (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,

  -- A full-day exception that overrides the recurring weekly schedule for
  -- that one date (spec section 20-21). V1 is full-day only -- no
  -- partial-day time off, no date-specific extra hours (spec section 51).
  unavailable_date date not null,

  created_at timestamptz not null default now(),

  constraint expert_unavailable_dates_unique unique (expert_profile_id, unavailable_date)
);

comment on table public.expert_unavailable_dates is
  'Full-day exceptions that override expert_availability_windows for that specific date. No partial-day exceptions in V1.';

-- No separate index needed: the unique constraint above already provides
-- a btree index usable for expert_profile_id-only lookups (leftmost
-- column), which is the only read pattern this table needs.

alter table public.expert_unavailable_dates enable row level security;
