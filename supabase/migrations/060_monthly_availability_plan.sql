-- 060_monthly_availability_plan.sql
--
-- The expert's monthly plan: "I give Pivotroom N hours a month (2-20), on
-- these days, at these times." Set during onboarding and on the
-- Availability page.
--
-- 1. expert_profiles.monthly_hours (2-20): a cap on BOOKED time. They may
--    open more time than this; once this many hours are booked (confirmed
--    or actively held) in a calendar month, in the expert's timezone, no
--    more bookings are taken that month.
-- 2. expert_weekly_availability_rules: "every Saturday 09:00-12:00".
--    Weekly repeats were retired in 022/027 when the model moved to
--    day-of-month rules; they come back here as their own table, next to
--    (not replacing) the day-of-month rules, one-offs and overrides.
-- 3. expert_all_raw_windows_for_date() also returns weekly windows, so
--    every consumer -- get_bookable_slots, expert_window_is_available,
--    create_booking_hold, reschedules -- sees them with no other change.
-- 4. get_bookable_slots() hides slots in months that are booked up to the
--    cap; a bookings trigger enforces the same cap on new bookings and on
--    moved bookings. It deliberately does NOT run on status changes, so a
--    payment confirming an existing hold can never be refused.
-- 5. set_expert_availability_plan(): saves hours + days + time windows in
--    one transaction. Works for the expert's own profile at any
--    application status (onboarding happens before approval).
-- 6. The open-time limit (max_expert_monthly_availability_minutes) goes
--    from 5 to 20 hours, matching the largest plan.
--
-- Non-destructive: one column, one table, replaced functions.

-- =========================================================================
-- 1. Monthly hours cap
-- =========================================================================

alter table public.expert_profiles
  add column if not exists monthly_hours smallint
  check (monthly_hours is null or monthly_hours between 2 and 20);

comment on column public.expert_profiles.monthly_hours is
  'Hours a month the expert gives Pivotroom (2-20). Caps booked time per calendar month (060). Written only by set_expert_availability_plan().';

-- =========================================================================
-- 2. Weekly rules
-- =========================================================================

create table if not exists public.expert_weekly_availability_rules (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  -- 0 = Sunday ... 6 = Saturday, same numbering as extract(dow from date).
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),

  constraint expert_weekly_rules_valid_range check (end_time > start_time),
  constraint expert_weekly_rules_start_grid check (
    date_part('minute', start_time)::int % 15 = 0 and date_part('second', start_time) = 0
  ),
  constraint expert_weekly_rules_end_grid check (
    date_part('minute', end_time)::int % 15 = 0 and date_part('second', end_time) = 0
  )
);

comment on table public.expert_weekly_availability_rules is
  'Weekly repeating availability ("every Saturday 09:00-12:00"), local time in the expert''s timezone (060). Written only by set_expert_availability_plan().';

create index if not exists expert_weekly_rules_expert_dow_idx
  on public.expert_weekly_availability_rules (expert_profile_id, day_of_week);

alter table public.expert_weekly_availability_rules enable row level security;

drop policy if exists "expert_weekly_availability_rules_select_own" on public.expert_weekly_availability_rules;
create policy "expert_weekly_availability_rules_select_own"
  on public.expert_weekly_availability_rules
  for select to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_profile_id and ep.user_id = (select auth.uid())
    )
  );

drop policy if exists "expert_weekly_availability_rules_select_admin" on public.expert_weekly_availability_rules;
create policy "expert_weekly_availability_rules_select_admin"
  on public.expert_weekly_availability_rules
  for select to authenticated
  using (public.is_admin());

-- Read-only to clients; all writes go through set_expert_availability_plan().
revoke all on public.expert_weekly_availability_rules from anon, authenticated;
grant select on public.expert_weekly_availability_rules to authenticated;

-- =========================================================================
-- 3. Weekly windows join every availability consumer
-- =========================================================================

create or replace function public.expert_all_raw_windows_for_date(p_expert_profile_id uuid, p_date date)
returns table (start_time time, end_time time)
language sql
stable
set search_path to 'public', 'pg_catalog'
as $function$
  select w.start_time, w.end_time
  from public.expert_recurring_and_override_windows_for_date(p_expert_profile_id, p_date) w
  union all
  select f.start_time, f.end_time
  from public.expert_one_off_availability f
  where f.expert_profile_id = p_expert_profile_id
    and f.available_date = p_date
  union all
  select wk.start_time, wk.end_time
  from public.expert_weekly_availability_rules wk
  where wk.expert_profile_id = p_expert_profile_id
    and wk.day_of_week = extract(dow from p_date)::int;
$function$;

-- =========================================================================
-- 4. Booked-time cap
-- =========================================================================

-- Minutes booked (confirmed, or held/awaiting payment and not expired) for
-- an expert between two instants, optionally ignoring one booking.
create or replace function public.expert_booked_minutes_between(
  p_expert_profile_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_exclude_booking_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
  select coalesce(sum(extract(epoch from (b.end_at - b.start_at)) / 60), 0)
  from public.bookings b
  where b.expert_profile_id = p_expert_profile_id
    and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
    and (
      b.booking_status = 'confirmed'
      or (b.booking_status in ('held', 'awaiting_payment') and b.hold_expires_at > now())
    )
    and b.start_at >= p_from
    and b.start_at < p_to;
$function$;

revoke execute on function public.expert_booked_minutes_between(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

create or replace function public.get_bookable_slots(
  p_expert_slug text,
  p_duration_minutes integer,
  p_session_format text,
  p_range_start date,
  p_range_end date,
  p_customer_timezone text default null,
  p_exclude_booking_id uuid default null
)
returns table (start_at timestamptz, end_at timestamptz, expert_timezone text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_expert_profile_id uuid;
  v_timezone text;
  v_session_type_id uuid;
  v_range_start date;
  v_range_end date;
  v_today date := (now() at time zone 'UTC')::date;
  v_date date;
  v_window record;
  v_candidate_start time;
  v_candidate_start_at timestamptz;
  v_candidate_end_at timestamptz;
  -- 060: monthly booked-time cap (null = no cap set).
  v_cap_minutes integer;
  v_cap_month date;
  v_cap_used numeric := 0;
begin
  if p_duration_minutes is null or p_duration_minutes not in (15, 30, 45, 60, 90) then
    return;
  end if;
  if p_session_format is null or p_session_format not in ('online', 'in_person') then
    return;
  end if;
  if p_expert_slug is null or char_length(p_expert_slug) = 0 or char_length(p_expert_slug) > 200 then
    return;
  end if;
  v_range_start := greatest(coalesce(p_range_start, v_today), v_today);
  v_range_end := least(
    coalesce(p_range_end, v_range_start + 31),
    v_range_start + 31,
    v_today + public.booking_horizon_days()
  );
  if v_range_end < v_range_start then
    return;
  end if;
  select ep.id, s.timezone, ep.monthly_hours * 60
    into v_expert_profile_id, v_timezone, v_cap_minutes
  from public.expert_profiles ep
  join public.expert_availability_settings s on s.expert_profile_id = ep.id
  where ep.slug = p_expert_slug
    and ep.profile_status = 'published'
    and ep.application_status = 'approved';
  if v_expert_profile_id is null then
    return;
  end if;
  select id into v_session_type_id
  from public.expert_session_types
  where expert_profile_id = v_expert_profile_id
    and duration_minutes = p_duration_minutes
    and is_active
    and (
      (p_session_format = 'online' and online_enabled)
      or (p_session_format = 'in_person' and in_person_enabled)
    );
  if v_session_type_id is null then
    return;
  end if;
  v_date := v_range_start;
  while v_date <= v_range_end loop
    -- The cap is per calendar month in the expert's timezone; v_date is a
    -- local date, so its month is the right bucket. Computed once a month.
    if v_cap_minutes is not null and v_cap_month is distinct from date_trunc('month', v_date)::date then
      v_cap_month := date_trunc('month', v_date)::date;
      v_cap_used := public.expert_booked_minutes_between(
        v_expert_profile_id,
        v_cap_month::timestamp at time zone v_timezone,
        (v_cap_month + interval '1 month')::timestamp at time zone v_timezone,
        p_exclude_booking_id
      );
    end if;
    if v_cap_minutes is null or v_cap_used + p_duration_minutes <= v_cap_minutes then
      for v_window in
        select w.start_time, w.end_time
        from public.expert_merged_windows_for_date(v_expert_profile_id, v_date) w
      loop
        v_candidate_start := v_window.start_time;
        while v_candidate_start + make_interval(mins => p_duration_minutes) <= v_window.end_time loop
          v_candidate_start_at := (v_date + v_candidate_start) at time zone v_timezone;
          v_candidate_end_at := v_candidate_start_at + make_interval(mins => p_duration_minutes);
          if v_candidate_start_at >= now() + make_interval(hours => public.booking_min_notice_hours())
            and v_candidate_start_at <= now() + make_interval(days => public.booking_horizon_days())
            and not exists (
              select 1
              from public.bookings b
              where b.expert_profile_id = v_expert_profile_id
                and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
                and (
                  b.booking_status = 'confirmed'
                  or (b.booking_status in ('held', 'awaiting_payment') and b.hold_expires_at > now())
                )
                and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(v_candidate_start_at, v_candidate_end_at, '[)')
            )
          then
            start_at := v_candidate_start_at;
            end_at := v_candidate_end_at;
            expert_timezone := v_timezone;
            return next;
          end if;
          v_candidate_start := v_candidate_start + make_interval(mins => public.booking_slot_increment_minutes());
        end loop;
      end loop;
    end if;
    v_date := v_date + 1;
  end loop;
end;
$function$;

-- Backstop for every path that creates or moves a booking (holds, customer
-- and admin reschedules). Only on INSERT or a change of time: a status
-- change (payment confirming a hold) never re-checks, so a paid client is
-- never refused.
create or replace function public.enforce_expert_monthly_hours_cap()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_cap_minutes integer;
  v_timezone text;
  v_month date;
  v_used numeric;
begin
  if new.booking_status not in ('held', 'awaiting_payment', 'confirmed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.start_at is not distinct from old.start_at and new.end_at is not distinct from old.end_at then
    return new;
  end if;

  select ep.monthly_hours * 60, coalesce(s.timezone, 'Africa/Addis_Ababa')
    into v_cap_minutes, v_timezone
  from public.expert_profiles ep
  left join public.expert_availability_settings s on s.expert_profile_id = ep.id
  where ep.id = new.expert_profile_id;

  if v_cap_minutes is null then
    return new;
  end if;

  v_month := date_trunc('month', new.start_at at time zone v_timezone)::date;
  v_used := public.expert_booked_minutes_between(
    new.expert_profile_id,
    v_month::timestamp at time zone v_timezone,
    (v_month + interval '1 month')::timestamp at time zone v_timezone,
    new.id
  );

  if v_used + extract(epoch from (new.end_at - new.start_at)) / 60 > v_cap_minutes then
    raise exception 'This expert is fully booked for that month. Please choose a time in another month.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

revoke execute on function public.enforce_expert_monthly_hours_cap() from public, anon, authenticated;

drop trigger if exists bookings_enforce_monthly_hours_cap on public.bookings;
create trigger bookings_enforce_monthly_hours_cap
  before insert or update of start_at, end_at on public.bookings
  for each row
  execute function public.enforce_expert_monthly_hours_cap();

-- =========================================================================
-- 5. Save the whole plan at once
-- =========================================================================

-- p_mode 'weekly': p_days are 0-6 (Sunday = 0). 'monthly': p_days are 1-28.
-- p_windows: [{"start":"09:00","end":"12:00"}, ...] (1-4, 15-minute grid,
-- not overlapping). Replaces the expert's weekly AND day-of-month rules
-- (a plan is one or the other); specific dates (one-offs) are kept.
create or replace function public.set_expert_availability_plan(
  p_monthly_hours integer,
  p_mode text,
  p_days integer[],
  p_windows jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_expert_profile_id uuid;
  v_window jsonb;
  v_start time;
  v_end time;
  v_starts time[] := '{}';
  v_ends time[] := '{}';
  v_day integer;
  i integer;
  j integer;
begin
  select id into v_expert_profile_id
  from public.expert_profiles
  where user_id = auth.uid();
  if v_expert_profile_id is null then
    raise exception 'No expert profile found for this account.' using errcode = '42501';
  end if;

  if p_monthly_hours is null or p_monthly_hours < 2 or p_monthly_hours > 20 then
    raise exception 'Choose between 2 and 20 hours a month.' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('weekly', 'monthly') then
    raise exception 'Choose weekdays or dates of the month.' using errcode = '22023';
  end if;
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'Pick at least one day.' using errcode = '22023';
  end if;
  if cardinality(p_days) > 28 then
    raise exception 'Too many days.' using errcode = '22023';
  end if;
  foreach v_day in array p_days loop
    if v_day is null
      or (p_mode = 'weekly' and (v_day < 0 or v_day > 6))
      or (p_mode = 'monthly' and (v_day < 1 or v_day > 28)) then
      raise exception 'One of the days isn''t valid.' using errcode = '22023';
    end if;
  end loop;

  if p_windows is null or jsonb_typeof(p_windows) <> 'array'
    or jsonb_array_length(p_windows) = 0 or jsonb_array_length(p_windows) > 4 then
    raise exception 'Pick at least one time of day.' using errcode = '22023';
  end if;
  for v_window in select * from jsonb_array_elements(p_windows) loop
    begin
      v_start := (v_window ->> 'start')::time;
      v_end := (v_window ->> 'end')::time;
    exception when others then
      raise exception 'One of the times isn''t valid.' using errcode = '22023';
    end;
    perform public.validate_availability_time_range(v_start, v_end);
    v_starts := v_starts || v_start;
    v_ends := v_ends || v_end;
  end loop;
  for i in 1 .. cardinality(v_starts) loop
    for j in (i + 1) .. cardinality(v_starts) loop
      if v_starts[i] < v_ends[j] and v_ends[i] > v_starts[j] then
        raise exception 'Two of your times overlap. Pick times that don''t overlap.' using errcode = '23P01';
      end if;
    end loop;
  end loop;

  update public.expert_profiles set monthly_hours = p_monthly_hours where id = v_expert_profile_id;

  delete from public.expert_weekly_availability_rules where expert_profile_id = v_expert_profile_id;
  delete from public.expert_monthly_availability_rules where expert_profile_id = v_expert_profile_id;

  if p_mode = 'weekly' then
    insert into public.expert_weekly_availability_rules (expert_profile_id, day_of_week, start_time, end_time)
    select v_expert_profile_id, d, v_starts[k], v_ends[k]
    from (select distinct unnest(p_days) as d) days
    cross join generate_subscripts(v_starts, 1) as k;
  else
    insert into public.expert_monthly_availability_rules (expert_profile_id, day_of_month, start_time, end_time)
    select v_expert_profile_id, d, v_starts[k], v_ends[k]
    from (select distinct unnest(p_days) as d) days
    cross join generate_subscripts(v_starts, 1) as k;
  end if;
end;
$function$;

revoke execute on function public.set_expert_availability_plan(integer, text, integer[], jsonb) from public, anon;
grant execute on function public.set_expert_availability_plan(integer, text, integer[], jsonb) to authenticated;

-- =========================================================================
-- 6. Open-time limit: 5 -> 20 hours
-- =========================================================================

create or replace function public.max_expert_monthly_availability_minutes(p_expert_profile_id uuid default null)
returns integer
language sql
set search_path to 'public', 'pg_catalog'
as $function$
  select 1200;
$function$;
