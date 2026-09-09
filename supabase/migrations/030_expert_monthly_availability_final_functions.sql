-- 030_expert_monthly_availability_final_functions.sql
-- Phase 4 final adjustment: the write/read-helper path for the tables
-- added in 028 (expert_monthly_availability_rules, expert_availability_
-- overrides) plus the rewritten expert_one_off_availability writes.
-- Migrations 001-029 are not modified.
--
-- Every RPC below resolves the caller's own approved expert_profile_id
-- via the existing resolve_own_approved_expert_profile_id()
-- (021_expert_availability_functions.sql, untouched) and never accepts
-- one as a parameter (spec sections 30, 36). validate_availability_time_
-- range() (025, untouched) is reused unchanged for every time-range
-- check below.
--
-- Two independent monthly caps, both driven by the single named function
-- max_expert_monthly_availability_minutes() below rather than a
-- hardcoded number in a CHECK constraint (spec section 19), so the limit
-- can later become per-expert configurable without touching every call
-- site:
--   Cap A -- the "regular monthly commitment": sum of the base recurring
--     rules' own durations. Enforced only when a rule is added/updated.
--   Cap B -- the actual computed total for one real calendar month
--     (natural occurrences + modified overrides landing in that month +
--     one-off availability in that month, skipped occurrences excluded).
--     Enforced when a one-off is added/updated or an occurrence is
--     modified for a specific month, since those are the only writes
--     that can push one real month above the limit without changing the
--     regular plan itself.

-- =========================================================================
-- Internal helpers -- no grant to anon/authenticated; only called from
-- inside the SECURITY DEFINER RPCs below (same precedent as
-- monthly_rule_matches_date in the now-retired 025).
-- =========================================================================

create or replace function public.max_expert_monthly_availability_minutes(p_expert_profile_id uuid default null)
returns int
language sql
set search_path = public, pg_catalog
as $$
  -- Flat 5-hour/month limit for every expert today. Takes an
  -- expert_profile_id (currently ignored) so a future per-expert
  -- override can replace the constant below without changing any of the
  -- call sites in this file.
  select 300;
$$;

comment on function public.max_expert_monthly_availability_minutes(uuid) is
  'The single named source of the monthly availability cap (currently 300 minutes / 5 hours for everyone). Internal only -- called from the write RPCs below, never exposed directly.';

revoke execute on function public.max_expert_monthly_availability_minutes(uuid) from public, anon, authenticated;

create or replace function public.validate_day_of_month(p_day_of_month int)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_day_of_month is null or p_day_of_month < 1 or p_day_of_month > 28 then
    raise exception 'day_of_month must be between 1 and 28.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.validate_day_of_month(int) from public, anon, authenticated;

-- "What's actually available on this one calendar date?" -- a natural
-- rule occurrence landing on p_date with no override for that exact
-- occurrence, UNION any modified override (from any rule, any original
-- month) that was moved TO p_date. Reused for one-off overlap checks and
-- for override overlap checks (spec section 7's cross-month move case).
-- p_exclude_override_id lets a caller ignore one specific override row
-- (the one currently being edited) while still seeing every other one.
create or replace function public.expert_recurring_and_override_windows_for_date(
  p_expert_profile_id uuid,
  p_date date,
  p_exclude_override_id uuid default null
)
returns table(start_time time, end_time time)
language sql
stable
set search_path = public, pg_catalog
as $$
  select r.start_time, r.end_time
  from public.expert_monthly_availability_rules r
  where r.expert_profile_id = p_expert_profile_id
    and r.day_of_month = extract(day from p_date)::int
    and not exists (
      select 1 from public.expert_availability_overrides o
      where o.recurring_rule_id = r.id
        and o.original_date = p_date
        and (p_exclude_override_id is null or o.id <> p_exclude_override_id)
    )

  union all

  select o.start_time, o.end_time
  from public.expert_availability_overrides o
  where o.expert_profile_id = p_expert_profile_id
    and o.override_type = 'modified'
    and o.override_date = p_date
    and (p_exclude_override_id is null or o.id <> p_exclude_override_id);
$$;

revoke execute on function public.expert_recurring_and_override_windows_for_date(uuid, date, uuid)
  from public, anon, authenticated;

-- The actual, computed total for one real (p_year, p_month) calendar
-- month: unoverridden natural occurrences + modified overrides landing in
-- that month + one-off availability in that month. p_exclude_override_id
-- and p_exclude_one_off_id remove one existing row's own prior
-- contribution (an update replacing itself); p_exclude_rule_id +
-- p_exclude_original_date additionally remove a natural occurrence that
-- is ABOUT to gain an override (no override row exists yet at the moment
-- this is called from set_expert_month_override, so without this the
-- natural duration and the candidate override duration would both count
-- when they land in the same month).
create or replace function public.expert_month_total_minutes(
  p_expert_profile_id uuid,
  p_year int,
  p_month int,
  p_exclude_override_id uuid default null,
  p_exclude_one_off_id uuid default null,
  p_exclude_rule_id uuid default null,
  p_exclude_original_date date default null
)
returns numeric
language sql
stable
set search_path = public, pg_catalog
as $$
  with natural_occurrences as (
    select
      r.id as rule_id,
      make_date(p_year, p_month, r.day_of_month) as occurrence_date,
      r.start_time,
      r.end_time
    from public.expert_monthly_availability_rules r
    where r.expert_profile_id = p_expert_profile_id
  ),
  unoverridden as (
    select n.start_time, n.end_time
    from natural_occurrences n
    where not exists (
        select 1 from public.expert_availability_overrides o
        where o.recurring_rule_id = n.rule_id
          and o.original_date = n.occurrence_date
          and (p_exclude_override_id is null or o.id <> p_exclude_override_id)
      )
      and not (
        p_exclude_rule_id is not null
        and n.rule_id = p_exclude_rule_id
        and n.occurrence_date = p_exclude_original_date
      )
  ),
  modified_in_month as (
    select o.start_time, o.end_time
    from public.expert_availability_overrides o
    where o.expert_profile_id = p_expert_profile_id
      and o.override_type = 'modified'
      and o.override_date >= make_date(p_year, p_month, 1)
      and o.override_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
      and (p_exclude_override_id is null or o.id <> p_exclude_override_id)
  ),
  one_offs_in_month as (
    select f.start_time, f.end_time
    from public.expert_one_off_availability f
    where f.expert_profile_id = p_expert_profile_id
      and f.available_date >= make_date(p_year, p_month, 1)
      and f.available_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
      and (p_exclude_one_off_id is null or f.id <> p_exclude_one_off_id)
  ),
  all_windows as (
    select * from unoverridden
    union all
    select * from modified_in_month
    union all
    select * from one_offs_in_month
  )
  select coalesce(sum(extract(epoch from (end_time - start_time)) / 60), 0) from all_windows;
$$;

revoke execute on function public.expert_month_total_minutes(uuid, int, int, uuid, uuid, uuid, date)
  from public, anon, authenticated;

-- =========================================================================
-- expert_monthly_availability_rules writes (Cap A)
-- =========================================================================

create or replace function public.add_expert_monthly_rule(
  p_day_of_month int,
  p_start_time time,
  p_end_time time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
  v_new_id uuid;
  v_existing_minutes numeric;
  v_new_minutes numeric;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  perform public.validate_day_of_month(p_day_of_month);
  perform public.validate_availability_time_range(p_start_time, p_end_time);

  select coalesce(sum(extract(epoch from (end_time - start_time)) / 60), 0)
    into v_existing_minutes
    from public.expert_monthly_availability_rules
    where expert_profile_id = v_expert_profile_id;

  v_new_minutes := extract(epoch from (p_end_time - p_start_time)) / 60;

  if v_existing_minutes + v_new_minutes > public.max_expert_monthly_availability_minutes(v_expert_profile_id) then
    raise exception 'Pivotroom currently supports up to 5 hours of recurring availability per month.' using errcode = '23514';
  end if;

  -- recurring vs recurring
  if exists (
    select 1
    from public.expert_monthly_availability_rules r
    where r.expert_profile_id = v_expert_profile_id
      and r.day_of_month = p_day_of_month
      and r.start_time < p_end_time
      and r.end_time > p_start_time
  ) then
    raise exception 'This availability overlaps an existing monthly rule.' using errcode = '23P01';
  end if;

  -- recurring vs modified-occurrence: a modified override sitting on any
  -- "<month>-<p_day_of_month>" would collide with this rule's natural
  -- occurrence every time that override's day-of-month recurs.
  if exists (
    select 1
    from public.expert_availability_overrides o
    where o.expert_profile_id = v_expert_profile_id
      and o.override_type = 'modified'
      and extract(day from o.override_date)::int = p_day_of_month
      and o.start_time < p_end_time
      and o.end_time > p_start_time
  ) then
    raise exception 'This overlaps a moved occurrence already scheduled on that day of the month.' using errcode = '23P01';
  end if;

  -- recurring vs one-off
  if exists (
    select 1
    from public.expert_one_off_availability f
    where f.expert_profile_id = v_expert_profile_id
      and extract(day from f.available_date)::int = p_day_of_month
      and f.start_time < p_end_time
      and f.end_time > p_start_time
  ) then
    raise exception 'This overlaps specific-date availability already scheduled on that day of the month.' using errcode = '23P01';
  end if;

  insert into public.expert_monthly_availability_rules
    (expert_profile_id, day_of_month, start_time, end_time)
  values (v_expert_profile_id, p_day_of_month, p_start_time, p_end_time)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.add_expert_monthly_rule(int, time, time) from public, anon;
grant execute on function public.add_expert_monthly_rule(int, time, time) to authenticated;

create or replace function public.update_expert_monthly_rule(
  p_rule_id uuid,
  p_day_of_month int,
  p_start_time time,
  p_end_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
  v_existing_minutes numeric;
  v_new_minutes numeric;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  if not exists (
    select 1 from public.expert_monthly_availability_rules
    where id = p_rule_id and expert_profile_id = v_expert_profile_id
  ) then
    raise exception 'Availability rule not found.' using errcode = '42501';
  end if;

  perform public.validate_day_of_month(p_day_of_month);
  perform public.validate_availability_time_range(p_start_time, p_end_time);

  select coalesce(sum(extract(epoch from (end_time - start_time)) / 60), 0)
    into v_existing_minutes
    from public.expert_monthly_availability_rules
    where expert_profile_id = v_expert_profile_id and id <> p_rule_id;

  v_new_minutes := extract(epoch from (p_end_time - p_start_time)) / 60;

  if v_existing_minutes + v_new_minutes > public.max_expert_monthly_availability_minutes(v_expert_profile_id) then
    raise exception 'Pivotroom currently supports up to 5 hours of recurring availability per month.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.expert_monthly_availability_rules r
    where r.expert_profile_id = v_expert_profile_id
      and r.id <> p_rule_id
      and r.day_of_month = p_day_of_month
      and r.start_time < p_end_time
      and r.end_time > p_start_time
  ) then
    raise exception 'This availability overlaps an existing monthly rule.' using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.expert_availability_overrides o
    where o.expert_profile_id = v_expert_profile_id
      and o.override_type = 'modified'
      and o.recurring_rule_id <> p_rule_id
      and extract(day from o.override_date)::int = p_day_of_month
      and o.start_time < p_end_time
      and o.end_time > p_start_time
  ) then
    raise exception 'This overlaps a moved occurrence already scheduled on that day of the month.' using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.expert_one_off_availability f
    where f.expert_profile_id = v_expert_profile_id
      and extract(day from f.available_date)::int = p_day_of_month
      and f.start_time < p_end_time
      and f.end_time > p_start_time
  ) then
    raise exception 'This overlaps specific-date availability already scheduled on that day of the month.' using errcode = '23P01';
  end if;

  -- Only the rule row changes -- existing overrides for this rule are
  -- never touched, even if their original_date no longer matches the new
  -- day_of_month (spec: changing the base rule must not rewrite or
  -- delete a month someone already customized).
  update public.expert_monthly_availability_rules
    set day_of_month = p_day_of_month,
        start_time = p_start_time,
        end_time = p_end_time
    where id = p_rule_id and expert_profile_id = v_expert_profile_id;
end;
$$;

revoke execute on function public.update_expert_monthly_rule(uuid, int, time, time) from public, anon;
grant execute on function public.update_expert_monthly_rule(uuid, int, time, time) to authenticated;

-- remove_expert_monthly_rule(uuid) from 025 is reused unchanged: its body
-- (`delete ... where id = p_rule_id and expert_profile_id = v_expert_
-- profile_id`) never referenced the retired week_of_month/day_of_week
-- columns, so it already works against the new table shape, and
-- ON DELETE CASCADE (028) removes any overrides for the deleted rule.

-- =========================================================================
-- expert_availability_overrides writes
-- =========================================================================

create or replace function public.set_expert_month_override(
  p_recurring_rule_id uuid,
  p_original_date date,
  p_override_type text,
  p_override_date date default null,
  p_start_time time default null,
  p_end_time time default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
  v_existing_override_id uuid;
  v_override_id uuid;
  v_existing_minutes numeric;
  v_new_minutes numeric;
  v_year int;
  v_month int;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  if not exists (
    select 1 from public.expert_monthly_availability_rules
    where id = p_recurring_rule_id and expert_profile_id = v_expert_profile_id
  ) then
    raise exception 'Availability rule not found.' using errcode = '42501';
  end if;

  if p_original_date is null then
    raise exception 'An original date is required.' using errcode = '22023';
  end if;

  if p_override_type is null or p_override_type not in ('modified', 'skipped') then
    raise exception 'override_type must be modified or skipped.' using errcode = '22023';
  end if;

  -- p_original_date must be an occurrence this rule could actually
  -- generate (its current day_of_month) -- unless an override already
  -- exists for exactly this (rule, original_date) pair, which allows
  -- restoring/editing a month that was customized before the rule's own
  -- day_of_month was later changed.
  if extract(day from p_original_date)::int <> (
      select day_of_month from public.expert_monthly_availability_rules where id = p_recurring_rule_id
    )
    and not exists (
      select 1 from public.expert_availability_overrides
      where recurring_rule_id = p_recurring_rule_id and original_date = p_original_date
    )
  then
    raise exception 'That occurrence does not belong to this recurring rule.' using errcode = '22023';
  end if;

  select id into v_existing_override_id
  from public.expert_availability_overrides
  where recurring_rule_id = p_recurring_rule_id and original_date = p_original_date;

  if p_override_type = 'skipped' then
    insert into public.expert_availability_overrides
      (expert_profile_id, recurring_rule_id, original_date, override_type, override_date, start_time, end_time)
    values (v_expert_profile_id, p_recurring_rule_id, p_original_date, 'skipped', null, null, null)
    on conflict (recurring_rule_id, original_date)
    do update set override_type = 'skipped', override_date = null, start_time = null, end_time = null
    returning id into v_override_id;

    return v_override_id;
  end if;

  -- override_type = 'modified'
  if p_override_date is null then
    raise exception 'A new date is required to modify this occurrence.' using errcode = '22023';
  end if;
  perform public.validate_availability_time_range(p_start_time, p_end_time);

  -- modified vs recurring, modified vs modified
  if exists (
    select 1
    from public.expert_recurring_and_override_windows_for_date(
      v_expert_profile_id, p_override_date, v_existing_override_id
    ) w
    where w.start_time < p_end_time and w.end_time > p_start_time
  ) then
    raise exception 'This overlaps availability you already have on that date.' using errcode = '23P01';
  end if;

  -- modified vs one-off
  if exists (
    select 1
    from public.expert_one_off_availability f
    where f.expert_profile_id = v_expert_profile_id
      and f.available_date = p_override_date
      and f.start_time < p_end_time
      and f.end_time > p_start_time
  ) then
    raise exception 'This overlaps specific-date availability you already have on that date.' using errcode = '23P01';
  end if;

  v_year := extract(year from p_override_date)::int;
  v_month := extract(month from p_override_date)::int;

  select public.expert_month_total_minutes(
    v_expert_profile_id, v_year, v_month,
    v_existing_override_id, null,
    p_recurring_rule_id, p_original_date
  ) into v_existing_minutes;
  v_existing_minutes := coalesce(v_existing_minutes, 0);

  v_new_minutes := extract(epoch from (p_end_time - p_start_time)) / 60;

  if v_existing_minutes + v_new_minutes > public.max_expert_monthly_availability_minutes(v_expert_profile_id) then
    raise exception 'This would put that month over Pivotroom''s availability limit.' using errcode = '23514';
  end if;

  insert into public.expert_availability_overrides
    (expert_profile_id, recurring_rule_id, original_date, override_type, override_date, start_time, end_time)
  values (v_expert_profile_id, p_recurring_rule_id, p_original_date, 'modified', p_override_date, p_start_time, p_end_time)
  on conflict (recurring_rule_id, original_date)
  do update set override_type = 'modified', override_date = excluded.override_date,
                start_time = excluded.start_time, end_time = excluded.end_time
  returning id into v_override_id;

  return v_override_id;
end;
$$;

revoke execute on function public.set_expert_month_override(uuid, date, text, date, time, time) from public, anon;
grant execute on function public.set_expert_month_override(uuid, date, text, date, time, time) to authenticated;

-- "Restore Regular Time": delete the override row entirely so the
-- occurrence reverts to the base rule's natural date/time (spec section
-- 12). The rule itself is never touched by this.
create or replace function public.remove_expert_month_override(p_override_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  delete from public.expert_availability_overrides
  where id = p_override_id and expert_profile_id = v_expert_profile_id;
end;
$$;

revoke execute on function public.remove_expert_month_override(uuid) from public, anon;
grant execute on function public.remove_expert_month_override(uuid) to authenticated;

-- =========================================================================
-- expert_one_off_availability writes (Cap B) -- same signatures as 025,
-- rewritten to check against the new day-of-month rules + overrides
-- model instead of the retired monthly_rule_matches_date(). Table shape
-- and its own one-off-vs-one-off trigger (023) are unchanged.
-- =========================================================================

create or replace function public.add_expert_one_off_availability(
  p_available_date date,
  p_start_time time,
  p_end_time time
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
  v_new_id uuid;
  v_existing_minutes numeric;
  v_new_minutes numeric;
  v_year int;
  v_month int;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  if p_available_date is null then
    raise exception 'A date is required.' using errcode = '22023';
  end if;
  perform public.validate_availability_time_range(p_start_time, p_end_time);

  -- one-off vs one-off
  if exists (
    select 1
    from public.expert_one_off_availability o
    where o.expert_profile_id = v_expert_profile_id
      and o.available_date = p_available_date
      and o.start_time < p_end_time
      and o.end_time > p_start_time
  ) then
    raise exception 'This overlaps availability you already added for that date.' using errcode = '23P01';
  end if;

  -- one-off vs recurring, one-off vs modified-occurrence
  if exists (
    select 1
    from public.expert_recurring_and_override_windows_for_date(v_expert_profile_id, p_available_date) w
    where w.start_time < p_end_time and w.end_time > p_start_time
  ) then
    raise exception 'This overlaps availability you already have on that date.' using errcode = '23P01';
  end if;

  v_year := extract(year from p_available_date)::int;
  v_month := extract(month from p_available_date)::int;

  select public.expert_month_total_minutes(v_expert_profile_id, v_year, v_month)
    into v_existing_minutes;
  v_existing_minutes := coalesce(v_existing_minutes, 0);

  v_new_minutes := extract(epoch from (p_end_time - p_start_time)) / 60;

  if v_existing_minutes + v_new_minutes > public.max_expert_monthly_availability_minutes(v_expert_profile_id) then
    raise exception 'This would put that month over Pivotroom''s availability limit.' using errcode = '23514';
  end if;

  insert into public.expert_one_off_availability (expert_profile_id, available_date, start_time, end_time)
  values (v_expert_profile_id, p_available_date, p_start_time, p_end_time)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.add_expert_one_off_availability(date, time, time) from public, anon;
grant execute on function public.add_expert_one_off_availability(date, time, time) to authenticated;

create or replace function public.update_expert_one_off_availability(
  p_id uuid,
  p_available_date date,
  p_start_time time,
  p_end_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
  v_existing_minutes numeric;
  v_new_minutes numeric;
  v_year int;
  v_month int;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  if not exists (
    select 1 from public.expert_one_off_availability
    where id = p_id and expert_profile_id = v_expert_profile_id
  ) then
    raise exception 'Availability not found.' using errcode = '42501';
  end if;

  if p_available_date is null then
    raise exception 'A date is required.' using errcode = '22023';
  end if;
  perform public.validate_availability_time_range(p_start_time, p_end_time);

  if exists (
    select 1
    from public.expert_one_off_availability o
    where o.expert_profile_id = v_expert_profile_id
      and o.id <> p_id
      and o.available_date = p_available_date
      and o.start_time < p_end_time
      and o.end_time > p_start_time
  ) then
    raise exception 'This overlaps availability you already added for that date.' using errcode = '23P01';
  end if;

  if exists (
    select 1
    from public.expert_recurring_and_override_windows_for_date(v_expert_profile_id, p_available_date) w
    where w.start_time < p_end_time and w.end_time > p_start_time
  ) then
    raise exception 'This overlaps availability you already have on that date.' using errcode = '23P01';
  end if;

  v_year := extract(year from p_available_date)::int;
  v_month := extract(month from p_available_date)::int;

  select public.expert_month_total_minutes(v_expert_profile_id, v_year, v_month, null, p_id)
    into v_existing_minutes;
  v_existing_minutes := coalesce(v_existing_minutes, 0);

  v_new_minutes := extract(epoch from (p_end_time - p_start_time)) / 60;

  if v_existing_minutes + v_new_minutes > public.max_expert_monthly_availability_minutes(v_expert_profile_id) then
    raise exception 'This would put that month over Pivotroom''s availability limit.' using errcode = '23514';
  end if;

  update public.expert_one_off_availability
    set available_date = p_available_date,
        start_time = p_start_time,
        end_time = p_end_time
    where id = p_id and expert_profile_id = v_expert_profile_id;
end;
$$;

revoke execute on function public.update_expert_one_off_availability(uuid, date, time, time) from public, anon;
grant execute on function public.update_expert_one_off_availability(uuid, date, time, time) to authenticated;

-- remove_expert_one_off_availability(uuid) from 025 is reused unchanged.
