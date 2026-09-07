-- 021_expert_availability_functions.sql
-- Phase 4: the only write path into the three availability tables.
-- Migrations 001-020 are not modified.
--
-- Every function here is SECURITY DEFINER with an explicit
-- `set search_path`, resolves the caller's own expert_profile_id from
-- `auth.uid()` internally, and NEVER accepts an expert_profile_id (or any
-- other ownership field) as a parameter -- a client cannot pass someone
-- else's id because the functions never look at one (spec sections 30,
-- 31, 33).

-- =========================================================================
-- resolve_own_approved_expert_profile_id(): internal helper, not exposed
-- as a callable RPC (no grant to anon/authenticated) -- only the
-- functions below call it, from inside their own SECURITY DEFINER
-- context. Raises if the caller has no expert_profiles row, or has one
-- that isn't application_status = 'approved' (spec section 26: ownership
-- alone is not enough).
-- =========================================================================

create or replace function public.resolve_own_approved_expert_profile_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.expert_profiles
  where user_id = auth.uid()
    and application_status = 'approved';

  if v_id is null then
    raise exception 'No approved expert profile found for the current user.' using errcode = '42501';
  end if;

  return v_id;
end;
$$;

comment on function public.resolve_own_approved_expert_profile_id() is
  'Internal only -- not granted to anon/authenticated. Every availability write function below calls this instead of accepting expert_profile_id as a parameter.';

revoke execute on function public.resolve_own_approved_expert_profile_id() from public, anon, authenticated;

-- =========================================================================
-- save_expert_availability_schedule(timezone, windows)
-- =========================================================================
-- Atomic replace of an expert's ENTIRE weekly schedule (spec section 29):
-- the whole function body is one statement from Postgres's point of view,
-- so if any validation fails or any write errors partway through, the
-- entire call rolls back -- there is no way for a caller to end up with a
-- half-deleted, half-inserted schedule.
--
-- p_windows shape: a JSON array of
--   {"day_of_week": 1-7, "start_time": "HH:MM", "end_time": "HH:MM"}
-- An empty array is valid and means "no weekly availability" (spec
-- section 38) -- it simply clears any existing schedule.
--
-- Validation order: every window in the batch is checked BEFORE any
-- write happens (day range, times present, end > start, 15-minute grid,
-- pairwise overlap across the whole incoming batch) so a single bad entry
-- never causes a partial save. The table-level CHECK constraints and the
-- prevent_expert_availability_window_overlap() trigger from
-- 019_expert_availability_tables.sql still apply on top of this as
-- defense in depth.
create or replace function public.save_expert_availability_schedule(
  p_timezone text,
  p_windows jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_expert_profile_id uuid;
  v_window jsonb;
  v_day_of_week int;
  v_start_time time;
  v_end_time time;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone: %', p_timezone using errcode = '22023';
  end if;

  if p_windows is null or jsonb_typeof(p_windows) is distinct from 'array' then
    raise exception 'windows must be a JSON array' using errcode = '22023';
  end if;

  for v_window in select * from jsonb_array_elements(p_windows)
  loop
    if jsonb_typeof(v_window -> 'day_of_week') is distinct from 'number' then
      raise exception 'day_of_week is required' using errcode = '22023';
    end if;
    v_day_of_week := (v_window ->> 'day_of_week')::int;
    v_start_time := (v_window ->> 'start_time')::time;
    v_end_time := (v_window ->> 'end_time')::time;

    if v_day_of_week < 1 or v_day_of_week > 7 then
      raise exception 'day_of_week must be between 1 and 7' using errcode = '22023';
    end if;
    if v_start_time is null or v_end_time is null then
      raise exception 'start_time and end_time are required' using errcode = '22023';
    end if;
    if v_end_time <= v_start_time then
      raise exception 'end_time must be after start_time' using errcode = '22023';
    end if;
    if date_part('minute', v_start_time)::int % 15 <> 0 or date_part('second', v_start_time) <> 0 then
      raise exception 'start_time must align to a 15-minute increment' using errcode = '22023';
    end if;
    if date_part('minute', v_end_time)::int % 15 <> 0 or date_part('second', v_end_time) <> 0 then
      raise exception 'end_time must align to a 15-minute increment' using errcode = '22023';
    end if;
  end loop;

  -- Pairwise overlap check across the whole incoming batch at once (the
  -- table trigger only ever sees one row at a time as they're inserted,
  -- so this is the check that actually catches "two windows in this same
  -- request overlap each other"). `a.idx < b.idx` compares every distinct
  -- pair exactly once and still catches two literally identical entries.
  if exists (
    select 1
    from jsonb_array_elements(p_windows) with ordinality as a(value, idx)
    join jsonb_array_elements(p_windows) with ordinality as b(value, idx) on a.idx < b.idx
    where (a.value ->> 'day_of_week')::int = (b.value ->> 'day_of_week')::int
      and (a.value ->> 'start_time')::time < (b.value ->> 'end_time')::time
      and (a.value ->> 'end_time')::time > (b.value ->> 'start_time')::time
  ) then
    raise exception 'Availability windows overlap' using errcode = '23P01';
  end if;

  insert into public.expert_availability_settings (expert_profile_id, timezone)
  values (v_expert_profile_id, p_timezone)
  on conflict (expert_profile_id) do update set timezone = excluded.timezone;

  delete from public.expert_availability_windows where expert_profile_id = v_expert_profile_id;

  insert into public.expert_availability_windows (expert_profile_id, day_of_week, start_time, end_time)
  select
    v_expert_profile_id,
    (w ->> 'day_of_week')::int,
    (w ->> 'start_time')::time,
    (w ->> 'end_time')::time
  from jsonb_array_elements(p_windows) w;
end;
$$;

comment on function public.save_expert_availability_schedule(text, jsonb) is
  'The only write path for expert_availability_settings/expert_availability_windows. Atomic: validates everything before writing anything, resolves the caller''s own approved expert_profile_id server-side, never accepts one as input.';

revoke execute on function public.save_expert_availability_schedule(text, jsonb) from public, anon;
grant execute on function public.save_expert_availability_schedule(text, jsonb) to authenticated;

-- =========================================================================
-- add_expert_unavailable_date(date) / remove_expert_unavailable_date(date)
-- =========================================================================
-- Single-row operations, so they don't need the same batch-atomicity
-- treatment as the weekly schedule -- but ownership resolution is
-- identical: the caller's own approved expert_profile_id, never a
-- client-supplied one (spec sections 32, 33).

create or replace function public.add_expert_unavailable_date(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  if p_date is null then
    raise exception 'A date is required.' using errcode = '22023';
  end if;

  insert into public.expert_unavailable_dates (expert_profile_id, unavailable_date)
  values (v_expert_profile_id, p_date)
  on conflict (expert_profile_id, unavailable_date) do nothing;
end;
$$;

revoke execute on function public.add_expert_unavailable_date(date) from public, anon;
grant execute on function public.add_expert_unavailable_date(date) to authenticated;

create or replace function public.remove_expert_unavailable_date(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  delete from public.expert_unavailable_dates
  where expert_profile_id = v_expert_profile_id
    and unavailable_date = p_date;
end;
$$;

revoke execute on function public.remove_expert_unavailable_date(date) from public, anon;
grant execute on function public.remove_expert_unavailable_date(date) to authenticated;
