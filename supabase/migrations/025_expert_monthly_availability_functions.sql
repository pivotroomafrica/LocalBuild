-- 025_expert_monthly_availability_functions.sql
-- Phase 4 adjustment: the only write path into
-- expert_monthly_availability_rules / expert_one_off_availability.
-- Migrations 001-024 are not modified.
--
-- Every write function resolves the caller's own approved
-- expert_profile_id via the existing resolve_own_approved_expert_
-- profile_id() (021_expert_availability_functions.sql, untouched) and
-- never accepts one as a parameter -- nothing for a client to spoof
-- (spec sections 30, 36).

-- =========================================================================
-- Date-arithmetic helpers -- pure, no table access, internal only (not
-- granted to anon/authenticated; only called from inside the RPCs below).
-- =========================================================================

-- Which occurrence of its weekday this date is within its month (1-5).
create or replace function public.nth_weekday_of_month(p_date date)
returns int
language sql
set search_path = public, pg_catalog
as $$
  select ((extract(day from p_date)::int - 1) / 7) + 1;
$$;

-- Whether this date is the LAST occurrence of its weekday in its month
-- (i.e. the same weekday 7 days later falls in the next month).
create or replace function public.is_last_weekday_of_month(p_date date)
returns boolean
language sql
set search_path = public, pg_catalog
as $$
  select date_trunc('month', p_date) <> date_trunc('month', p_date + interval '7 days');
$$;

-- Does a given local calendar date match a monthly rule's
-- (week_of_month, day_of_week)? Mirrors the TypeScript implementation in
-- lib/availability/engine.ts (doesDateMatchMonthlyRule) -- kept in sync
-- deliberately, since this is the same logic used both to block a
-- one-off from overlapping a recurring occurrence (below) and, in
-- lib/availability/engine.ts, to answer "what's available on date Y" for
-- a future booking phase.
create or replace function public.monthly_rule_matches_date(
  p_week_of_month text,
  p_day_of_week smallint,
  p_date date
)
returns boolean
language sql
set search_path = public, pg_catalog
as $$
  select
    extract(isodow from p_date)::int = p_day_of_week
    and (
      (p_week_of_month = 'first' and public.nth_weekday_of_month(p_date) = 1)
      or (p_week_of_month = 'second' and public.nth_weekday_of_month(p_date) = 2)
      or (p_week_of_month = 'third' and public.nth_weekday_of_month(p_date) = 3)
      or (p_week_of_month = 'fourth' and public.nth_weekday_of_month(p_date) = 4)
      or (p_week_of_month = 'last' and public.is_last_weekday_of_month(p_date))
    );
$$;

revoke execute on function public.nth_weekday_of_month(date) from public, anon, authenticated;
revoke execute on function public.is_last_weekday_of_month(date) from public, anon, authenticated;
revoke execute on function public.monthly_rule_matches_date(text, smallint, date) from public, anon, authenticated;

-- =========================================================================
-- Shared field validation -- internal only, raises on the first problem
-- found so add/update below don't each repeat the same checks inline.
-- =========================================================================

create or replace function public.validate_monthly_rule_fields(p_week_of_month text, p_day_of_week int)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_week_of_month is null or p_week_of_month not in ('first', 'second', 'third', 'fourth', 'last') then
    raise exception 'week_of_month must be one of first, second, third, fourth, last.' using errcode = '22023';
  end if;
  if p_day_of_week is null or p_day_of_week < 1 or p_day_of_week > 7 then
    raise exception 'day_of_week must be between 1 and 7.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.validate_availability_time_range(p_start_time time, p_end_time time)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_start_time is null or p_end_time is null then
    raise exception 'A start time and end time are required.' using errcode = '22023';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'End time must be after start time.' using errcode = '22023';
  end if;
  if date_part('minute', p_start_time)::int % 15 <> 0 or date_part('second', p_start_time) <> 0 then
    raise exception 'Start time must align to a 15-minute increment.' using errcode = '22023';
  end if;
  if date_part('minute', p_end_time)::int % 15 <> 0 or date_part('second', p_end_time) <> 0 then
    raise exception 'End time must align to a 15-minute increment.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.validate_monthly_rule_fields(text, int) from public, anon, authenticated;
revoke execute on function public.validate_availability_time_range(time, time) from public, anon, authenticated;

-- =========================================================================
-- expert_monthly_availability_rules writes
-- =========================================================================
-- The 5-hour (300-minute) monthly cap (spec section 16) applies only to
-- recurring rules -- it is a simple SUM of every rule's duration,
-- deliberately not weighted by how many times "fourth"/"last" might
-- collapse into the same date in a given month (spec section 14: "do not
-- store another duplicate value unless technically required, prefer
-- deriving it" -- summed durations is the derivation, kept simple).

create or replace function public.add_expert_monthly_rule(
  p_week_of_month text,
  p_day_of_week int,
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

  perform public.validate_monthly_rule_fields(p_week_of_month, p_day_of_week);
  perform public.validate_availability_time_range(p_start_time, p_end_time);

  select coalesce(sum(extract(epoch from (end_time - start_time)) / 60), 0)
    into v_existing_minutes
    from public.expert_monthly_availability_rules
    where expert_profile_id = v_expert_profile_id;

  v_new_minutes := extract(epoch from (p_end_time - p_start_time)) / 60;

  if v_existing_minutes + v_new_minutes > 300 then
    raise exception 'Pivotroom currently supports up to 5 hours of recurring availability per month.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.expert_monthly_availability_rules r
    where r.expert_profile_id = v_expert_profile_id
      and r.day_of_week = p_day_of_week
      and (
        r.week_of_month = p_week_of_month
        or (r.week_of_month in ('fourth', 'last') and p_week_of_month in ('fourth', 'last'))
      )
      and r.start_time < p_end_time
      and r.end_time > p_start_time
  ) then
    raise exception 'This availability overlaps an existing monthly rule.' using errcode = '23P01';
  end if;

  insert into public.expert_monthly_availability_rules
    (expert_profile_id, week_of_month, day_of_week, start_time, end_time)
  values (v_expert_profile_id, p_week_of_month, p_day_of_week, p_start_time, p_end_time)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.add_expert_monthly_rule(text, int, time, time) from public, anon;
grant execute on function public.add_expert_monthly_rule(text, int, time, time) to authenticated;

create or replace function public.update_expert_monthly_rule(
  p_rule_id uuid,
  p_week_of_month text,
  p_day_of_week int,
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

  perform public.validate_monthly_rule_fields(p_week_of_month, p_day_of_week);
  perform public.validate_availability_time_range(p_start_time, p_end_time);

  -- Cap check excludes the rule being edited -- otherwise shrinking or
  -- moving an existing rule would double-count its own prior duration.
  select coalesce(sum(extract(epoch from (end_time - start_time)) / 60), 0)
    into v_existing_minutes
    from public.expert_monthly_availability_rules
    where expert_profile_id = v_expert_profile_id and id <> p_rule_id;

  v_new_minutes := extract(epoch from (p_end_time - p_start_time)) / 60;

  if v_existing_minutes + v_new_minutes > 300 then
    raise exception 'Pivotroom currently supports up to 5 hours of recurring availability per month.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.expert_monthly_availability_rules r
    where r.expert_profile_id = v_expert_profile_id
      and r.id <> p_rule_id
      and r.day_of_week = p_day_of_week
      and (
        r.week_of_month = p_week_of_month
        or (r.week_of_month in ('fourth', 'last') and p_week_of_month in ('fourth', 'last'))
      )
      and r.start_time < p_end_time
      and r.end_time > p_start_time
  ) then
    raise exception 'This availability overlaps an existing monthly rule.' using errcode = '23P01';
  end if;

  update public.expert_monthly_availability_rules
    set week_of_month = p_week_of_month,
        day_of_week = p_day_of_week,
        start_time = p_start_time,
        end_time = p_end_time
    where id = p_rule_id and expert_profile_id = v_expert_profile_id;
end;
$$;

revoke execute on function public.update_expert_monthly_rule(uuid, text, int, time, time) from public, anon;
grant execute on function public.update_expert_monthly_rule(uuid, text, int, time, time) to authenticated;

create or replace function public.remove_expert_monthly_rule(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  delete from public.expert_monthly_availability_rules
  where id = p_rule_id and expert_profile_id = v_expert_profile_id;
end;
$$;

revoke execute on function public.remove_expert_monthly_rule(uuid) from public, anon;
grant execute on function public.remove_expert_monthly_rule(uuid) to authenticated;

-- =========================================================================
-- expert_one_off_availability writes
-- =========================================================================
-- No hard monthly cap on one-off availability (spec section 18's
-- documented simplification): it is informational only, shown to the
-- expert as part of "this month's total," and may push a given month's
-- total above 5 hours. Only the recurring-rule cap above is a hard block.

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
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  if p_available_date is null then
    raise exception 'A date is required.' using errcode = '22023';
  end if;
  perform public.validate_availability_time_range(p_start_time, p_end_time);

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

  -- One-off vs recurring (spec section 27): reject if a monthly rule
  -- already resolves to this exact date with an overlapping time.
  if exists (
    select 1
    from public.expert_monthly_availability_rules r
    where r.expert_profile_id = v_expert_profile_id
      and public.monthly_rule_matches_date(r.week_of_month, r.day_of_week, p_available_date)
      and r.start_time < p_end_time
      and r.end_time > p_start_time
  ) then
    raise exception 'This overlaps your recurring monthly availability on that date.' using errcode = '23P01';
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
    from public.expert_monthly_availability_rules r
    where r.expert_profile_id = v_expert_profile_id
      and public.monthly_rule_matches_date(r.week_of_month, r.day_of_week, p_available_date)
      and r.start_time < p_end_time
      and r.end_time > p_start_time
  ) then
    raise exception 'This overlaps your recurring monthly availability on that date.' using errcode = '23P01';
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

create or replace function public.remove_expert_one_off_availability(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expert_profile_id uuid;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  delete from public.expert_one_off_availability
  where id = p_id and expert_profile_id = v_expert_profile_id;
end;
$$;

revoke execute on function public.remove_expert_one_off_availability(uuid) from public, anon;
grant execute on function public.remove_expert_one_off_availability(uuid) to authenticated;
