-- Pivotroom new project setup, part 2 of 2: migrations 019-051 + starter data.
-- Part 1 (migrations 001-018) was applied to the project already.
-- Paste ALL of this into Supabase -> SQL Editor -> New query, then Run.
-- All or nothing: if any line fails, nothing is changed.
begin;

-- ===== 019_expert_availability_tables.sql
create table public.expert_availability_settings (
  expert_profile_id uuid primary key references public.expert_profiles (id) on delete cascade,
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
create table public.expert_availability_windows (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expert_availability_windows_valid_range check (end_time > start_time),
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
create table public.expert_unavailable_dates (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  unavailable_date date not null,
  created_at timestamptz not null default now(),
  constraint expert_unavailable_dates_unique unique (expert_profile_id, unavailable_date)
);
comment on table public.expert_unavailable_dates is
  'Full-day exceptions that override expert_availability_windows for that specific date. No partial-day exceptions in V1.';
alter table public.expert_unavailable_dates enable row level security;

-- ===== 020_expert_availability_rls.sql
create policy "expert_availability_settings_select_own"
  on public.expert_availability_settings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_availability_settings.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );
create policy "expert_availability_settings_select_admin"
  on public.expert_availability_settings
  for select
  to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.expert_availability_settings from authenticated;
grant select on public.expert_availability_settings to authenticated;
create policy "expert_availability_windows_select_own"
  on public.expert_availability_windows
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_availability_windows.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );
create policy "expert_availability_windows_select_admin"
  on public.expert_availability_windows
  for select
  to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.expert_availability_windows from authenticated;
grant select on public.expert_availability_windows to authenticated;
create policy "expert_unavailable_dates_select_own"
  on public.expert_unavailable_dates
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_unavailable_dates.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );
create policy "expert_unavailable_dates_select_admin"
  on public.expert_unavailable_dates
  for select
  to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.expert_unavailable_dates from authenticated;
grant select on public.expert_unavailable_dates to authenticated;

-- ===== 021_expert_availability_functions.sql
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

-- ===== 022_retire_weekly_availability_model.sql
drop function if exists public.save_expert_availability_schedule(text, jsonb);
drop table if exists public.expert_availability_windows;
drop function if exists public.prevent_expert_availability_window_overlap();
comment on table public.expert_availability_settings is
  'One row per expert: their IANA timezone. Shared by both the monthly recurring rules (expert_monthly_availability_rules, 023) and one-off availability (expert_one_off_availability, 023), which both store local wall-clock time interpreted in this zone. Reused unchanged from the retired weekly model (019_expert_availability_tables.sql) -- this table always only ever stored a timezone, nothing weekly-specific.';
comment on table public.expert_unavailable_dates is
  'A date the expert is fully unavailable, overriding BOTH the monthly recurring rules and any one-off availability for that date (023). Reused unchanged from the retired weekly model -- "full-day exception" was always the correct semantics; only what it overrides has changed from a weekly schedule to a monthly one.';

-- ===== 023_expert_monthly_availability_tables.sql
create table public.expert_monthly_availability_rules (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  week_of_month text not null
    check (week_of_month in ('first', 'second', 'third', 'fourth', 'last')),
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expert_monthly_rules_valid_range check (end_time > start_time),
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
create table public.expert_one_off_availability (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
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

-- ===== 024_expert_monthly_availability_rls.sql
create policy "expert_monthly_availability_rules_select_own"
  on public.expert_monthly_availability_rules
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_monthly_availability_rules.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );
create policy "expert_monthly_availability_rules_select_admin"
  on public.expert_monthly_availability_rules
  for select
  to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.expert_monthly_availability_rules from authenticated;
grant select on public.expert_monthly_availability_rules to authenticated;
create policy "expert_one_off_availability_select_own"
  on public.expert_one_off_availability
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_one_off_availability.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );
create policy "expert_one_off_availability_select_admin"
  on public.expert_one_off_availability
  for select
  to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.expert_one_off_availability from authenticated;
grant select on public.expert_one_off_availability to authenticated;

-- ===== 025_expert_monthly_availability_functions.sql
create or replace function public.nth_weekday_of_month(p_date date)
returns int
language sql
set search_path = public, pg_catalog
as $$
  select ((extract(day from p_date)::int - 1) / 7) + 1;
$$;
create or replace function public.is_last_weekday_of_month(p_date date)
returns boolean
language sql
set search_path = public, pg_catalog
as $$
  select date_trunc('month', p_date) <> date_trunc('month', p_date + interval '7 days');
$$;
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

-- ===== 026_expert_availability_timezone_function.sql
create or replace function public.set_expert_availability_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_expert_profile_id uuid;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone: %', p_timezone using errcode = '22023';
  end if;
  insert into public.expert_availability_settings (expert_profile_id, timezone)
  values (v_expert_profile_id, p_timezone)
  on conflict (expert_profile_id) do update set timezone = excluded.timezone;
end;
$$;
comment on function public.set_expert_availability_timezone(text) is
  'The only write path for expert_availability_settings.timezone. Resolves the caller''s own approved expert_profile_id server-side, never accepts one as input.';
revoke execute on function public.set_expert_availability_timezone(text) from public, anon;
grant execute on function public.set_expert_availability_timezone(text) to authenticated;

-- ===== 027_retire_week_of_month_and_unavailable_dates.sql
drop function if exists public.add_expert_unavailable_date(date);
drop function if exists public.remove_expert_unavailable_date(date);
drop table if exists public.expert_unavailable_dates;
drop function if exists public.add_expert_monthly_rule(text, int, time, time);
drop function if exists public.update_expert_monthly_rule(uuid, text, int, time, time);
drop function if exists public.validate_monthly_rule_fields(text, int);
drop function if exists public.monthly_rule_matches_date(text, smallint, date);
drop function if exists public.is_last_weekday_of_month(date);
drop function if exists public.nth_weekday_of_month(date);
drop table if exists public.expert_monthly_availability_rules;
drop function if exists public.prevent_expert_monthly_rule_overlap();

-- ===== 028_expert_monthly_availability_final_tables.sql
create table public.expert_monthly_availability_rules (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  day_of_month smallint not null check (day_of_month between 1 and 28),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expert_monthly_rules_valid_range check (end_time > start_time),
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
create table public.expert_availability_overrides (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  recurring_rule_id uuid not null references public.expert_monthly_availability_rules (id) on delete cascade,
  original_date date not null,
  override_type text not null check (override_type in ('modified', 'skipped')),
  override_date date,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
create index expert_availability_overrides_override_date_idx
  on public.expert_availability_overrides (expert_profile_id, override_date)
  where override_type = 'modified';
alter table public.expert_availability_overrides enable row level security;
create trigger set_expert_availability_overrides_updated_at
  before update on public.expert_availability_overrides
  for each row
  execute function public.set_updated_at();

-- ===== 029_expert_monthly_availability_final_rls.sql
create policy "expert_monthly_availability_rules_select_own"
  on public.expert_monthly_availability_rules
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_monthly_availability_rules.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );
create policy "expert_monthly_availability_rules_select_admin"
  on public.expert_monthly_availability_rules
  for select
  to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.expert_monthly_availability_rules from authenticated;
grant select on public.expert_monthly_availability_rules to authenticated;
create policy "expert_availability_overrides_select_own"
  on public.expert_availability_overrides
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_availability_overrides.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );
create policy "expert_availability_overrides_select_admin"
  on public.expert_availability_overrides
  for select
  to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.expert_availability_overrides from authenticated;
grant select on public.expert_availability_overrides to authenticated;

-- ===== 030_expert_monthly_availability_final_functions.sql
create or replace function public.max_expert_monthly_availability_minutes(p_expert_profile_id uuid default null)
returns int
language sql
set search_path = public, pg_catalog
as $$
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
  update public.expert_monthly_availability_rules
    set day_of_month = p_day_of_month,
        start_time = p_start_time,
        end_time = p_end_time
    where id = p_rule_id and expert_profile_id = v_expert_profile_id;
end;
$$;
revoke execute on function public.update_expert_monthly_rule(uuid, int, time, time) from public, anon;
grant execute on function public.update_expert_monthly_rule(uuid, int, time, time) to authenticated;
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
  if p_override_date is null then
    raise exception 'A new date is required to modify this occurrence.' using errcode = '22023';
  end if;
  perform public.validate_availability_time_range(p_start_time, p_end_time);
  if exists (
    select 1
    from public.expert_recurring_and_override_windows_for_date(
      v_expert_profile_id, p_override_date, v_existing_override_id
    ) w
    where w.start_time < p_end_time and w.end_time > p_start_time
  ) then
    raise exception 'This overlaps availability you already have on that date.' using errcode = '23P01';
  end if;
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

-- ===== 031_public_data_functions.sql
drop view if exists public.expert_directory_public;
drop view if exists public.expert_profile_public;
drop view if exists public.expert_session_types_public;
create or replace function public.get_expert_directory_public()
returns table (
  slug text,
  headline text,
  current_position text,
  current_company text,
  profile_image_path text,
  online_enabled boolean,
  in_person_enabled boolean,
  full_name text,
  category_names text[],
  starting_price numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ep.slug,
    ep.headline,
    ep.current_position,
    ep.current_company,
    ep.profile_image_path,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(c.name order by c.sort_order)
      from (
        select ec.name, ec.sort_order
        from public.expert_profile_categories epc
        join public.expert_categories ec on ec.id = epc.category_id
        where epc.expert_profile_id = ep.id
        order by ec.sort_order
        limit 3
      ) c
    ) as category_names,
    (
      select min(est.base_price)
      from public.expert_session_types est
      where est.expert_profile_id = ep.id and est.is_active = true
    ) as starting_price
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  where ep.profile_status = 'published'
  order by p.full_name;
$$;
comment on function public.get_expert_directory_public() is
  'Public directory card projection -- replaces the expert_directory_public view (016/031) to avoid the Security Definer View advisor finding. Same column list, same profile_status = published filter, same SECURITY DEFINER mechanism, now as a function so anon never gets a direct grant on any base table.';
revoke execute on function public.get_expert_directory_public() from public;
grant execute on function public.get_expert_directory_public() to anon, authenticated;
create or replace function public.get_expert_profile_public(p_slug text)
returns table (
  slug text,
  headline text,
  current_position text,
  current_company text,
  years_experience_range text,
  short_bio text,
  expertise_summary text,
  problems_help_with text,
  who_i_help text,
  career_highlights text,
  linkedin_url text,
  country text,
  city text,
  profile_image_path text,
  online_enabled boolean,
  in_person_enabled boolean,
  full_name text,
  category_names text[]
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ep.slug,
    ep.headline,
    ep.current_position,
    ep.current_company,
    ep.years_experience_range,
    ep.short_bio,
    ep.expertise_summary,
    ep.problems_help_with,
    ep.who_i_help,
    ep.career_highlights,
    ep.linkedin_url,
    ep.country,
    ep.city,
    ep.profile_image_path,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ) as category_names
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  where ep.profile_status = 'published' and ep.slug = p_slug;
$$;
comment on function public.get_expert_profile_public(text) is
  'Public single-profile projection, keyed by slug -- replaces the expert_profile_public view (016/031). Resolves to zero rows for any non-published slug (including one that does not exist), identical to the view''s behavior, so a private application never leaks its existence.';
revoke execute on function public.get_expert_profile_public(text) from public;
grant execute on function public.get_expert_profile_public(text) to anon, authenticated;
create or replace function public.get_expert_session_types_public(p_slug text)
returns table (
  slug text,
  duration_minutes integer,
  base_price numeric,
  currency text,
  online_enabled boolean,
  in_person_enabled boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ep.slug,
    est.duration_minutes,
    est.base_price,
    est.currency,
    est.online_enabled,
    est.in_person_enabled
  from public.expert_session_types est
  join public.expert_profiles ep on ep.id = est.expert_profile_id
  where ep.profile_status = 'published'
    and est.is_active = true
    and ep.slug = p_slug
  order by est.duration_minutes;
$$;
comment on function public.get_expert_session_types_public(text) is
  'Public session pricing projection, keyed by slug -- replaces the expert_session_types_public view (016/031). Active durations for published experts only.';
revoke execute on function public.get_expert_session_types_public(text) from public;
grant execute on function public.get_expert_session_types_public(text) to anon, authenticated;

-- ===== 032_bookings.sql
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  session_type_id uuid references public.expert_session_types (id) on delete set null,
  duration_minutes integer not null check (duration_minutes in (15, 30, 45, 60, 90)),
  session_format text not null check (session_format in ('online', 'in_person')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  expert_timezone text not null,
  customer_timezone text,
  base_price numeric(12, 2) not null check (base_price > 0),
  currency text not null default 'ETB',
  booking_status text not null default 'held'
    check (booking_status in ('held', 'awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired')),
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_valid_range check (end_at > start_at),
  constraint bookings_valid_duration check (end_at = start_at + make_interval(mins => duration_minutes)),
  constraint bookings_hold_expiry_required check (
    (booking_status in ('held', 'awaiting_payment') and hold_expires_at is not null)
    or (booking_status not in ('held', 'awaiting_payment'))
  )
);
comment on table public.bookings is
  'A specific booking attempt: a real appointment (start_at/end_at in UTC) or, before that, a temporary hold on it. booking_status/hold_expires_at together represent the hold state machine -- see 034_booking_functions.sql for the only write path in.';
create index bookings_customer_id_idx on public.bookings (customer_id);
create index bookings_expert_profile_id_idx on public.bookings (expert_profile_id);
create index bookings_status_idx on public.bookings (booking_status);
create index bookings_start_at_idx on public.bookings (start_at);
alter table public.bookings enable row level security;
create trigger set_bookings_updated_at
  before update on public.bookings
  for each row
  execute function public.set_updated_at();
create extension if not exists btree_gist with schema extensions;
alter table public.bookings
  add constraint bookings_no_overlapping_expert_time
  exclude using gist (
    expert_profile_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (booking_status in ('held', 'awaiting_payment', 'confirmed'));
alter table public.bookings
  add constraint bookings_no_overlapping_customer_time
  exclude using gist (
    customer_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (booking_status in ('held', 'awaiting_payment', 'confirmed'));
create table public.booking_intake (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  discussion_topic text not null,
  additional_context text not null,
  materials_to_review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_intake_discussion_topic_length check (char_length(discussion_topic) between 1 and 500),
  constraint booking_intake_additional_context_length check (char_length(additional_context) between 1 and 1500),
  constraint booking_intake_materials_length check (materials_to_review is null or char_length(materials_to_review) <= 1000)
);
comment on table public.booking_intake is
  'Booking-specific preparation questions for the expert -- not part of the permanent customer_profiles professional profile. One row per booking, upserted by save_booking_intake() (034).';
alter table public.booking_intake enable row level security;
create trigger set_booking_intake_updated_at
  before update on public.booking_intake
  for each row
  execute function public.set_updated_at();

-- ===== 033_bookings_rls.sql
revoke all on public.bookings from anon, authenticated;
revoke all on public.booking_intake from anon, authenticated;
create policy "bookings_select_own"
  on public.bookings
  for select
  to authenticated
  using (customer_id = (select auth.uid()));
create policy "bookings_select_admin"
  on public.bookings
  for select
  to authenticated
  using (public.is_admin());
grant select on public.bookings to authenticated;
create policy "booking_intake_select_own"
  on public.booking_intake
  for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_intake.booking_id
        and b.customer_id = (select auth.uid())
    )
  );
create policy "booking_intake_select_admin"
  on public.booking_intake
  for select
  to authenticated
  using (public.is_admin());
grant select on public.booking_intake to authenticated;

-- ===== 034_booking_functions.sql
create or replace function public.booking_slot_increment_minutes()
returns int
language sql
immutable
set search_path = public
as $$ select 15; $$;
create or replace function public.booking_hold_minutes()
returns int
language sql
immutable
set search_path = public
as $$ select 15; $$;
create or replace function public.booking_min_notice_hours()
returns int
language sql
immutable
set search_path = public
as $$ select 24; $$;
create or replace function public.booking_horizon_days()
returns int
language sql
immutable
set search_path = public
as $$ select 90; $$;
revoke execute on function public.booking_slot_increment_minutes() from public, anon, authenticated;
revoke execute on function public.booking_hold_minutes() from public, anon, authenticated;
revoke execute on function public.booking_min_notice_hours() from public, anon, authenticated;
revoke execute on function public.booking_horizon_days() from public, anon, authenticated;
create or replace function public.expert_all_raw_windows_for_date(
  p_expert_profile_id uuid,
  p_date date
)
returns table(start_time time, end_time time)
language sql
stable
set search_path = public, pg_catalog
as $$
  select w.start_time, w.end_time
  from public.expert_recurring_and_override_windows_for_date(p_expert_profile_id, p_date) w
  union all
  select f.start_time, f.end_time
  from public.expert_one_off_availability f
  where f.expert_profile_id = p_expert_profile_id
    and f.available_date = p_date;
$$;
revoke execute on function public.expert_all_raw_windows_for_date(uuid, date) from public, anon, authenticated;
create or replace function public.expert_merged_windows_for_date(
  p_expert_profile_id uuid,
  p_date date
)
returns table(start_time time, end_time time)
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_rec record;
  v_current_start time;
  v_current_end time;
  v_has_current boolean := false;
begin
  for v_rec in
    select w.start_time, w.end_time
    from public.expert_all_raw_windows_for_date(p_expert_profile_id, p_date) w
    order by w.start_time, w.end_time
  loop
    if not v_has_current then
      v_current_start := v_rec.start_time;
      v_current_end := v_rec.end_time;
      v_has_current := true;
    elsif v_rec.start_time <= v_current_end then
      if v_rec.end_time > v_current_end then
        v_current_end := v_rec.end_time;
      end if;
    else
      start_time := v_current_start;
      end_time := v_current_end;
      return next;
      v_current_start := v_rec.start_time;
      v_current_end := v_rec.end_time;
    end if;
  end loop;
  if v_has_current then
    start_time := v_current_start;
    end_time := v_current_end;
    return next;
  end if;
end;
$$;
revoke execute on function public.expert_merged_windows_for_date(uuid, date) from public, anon, authenticated;
create or replace function public.expert_window_is_available(
  p_expert_profile_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.expert_merged_windows_for_date(p_expert_profile_id, p_date) w
    where w.start_time <= p_start_time and w.end_time >= p_end_time
  );
$$;
revoke execute on function public.expert_window_is_available(uuid, date, time, time) from public, anon, authenticated;
create or replace function public.get_bookable_slots(
  p_expert_slug text,
  p_duration_minutes int,
  p_session_format text,
  p_range_start date,
  p_range_end date,
  p_customer_timezone text default null
)
returns table(start_at timestamptz, end_at timestamptz, expert_timezone text)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
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
  select ep.id, s.timezone
    into v_expert_profile_id, v_timezone
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
    v_date := v_date + 1;
  end loop;
end;
$$;
comment on function public.get_bookable_slots(text, int, text, date, date, text) is
  'The only public read path for bookable times -- derives Phase 4 availability (rules + overrides + one-offs, merged) minus active bookings, entirely server-side. Returns only start_at/end_at/expert_timezone, never a raw availability or booking row.';
revoke execute on function public.get_bookable_slots(text, int, text, date, date, text) from public;
grant execute on function public.get_bookable_slots(text, int, text, date, date, text) to anon, authenticated;
create or replace function public.generate_booking_reference()
returns text
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_candidate text;
  v_i int;
  v_attempt int := 0;
begin
  loop
    v_candidate := 'PR-';
    for v_i in 1..6 loop
      v_candidate := v_candidate || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.bookings where booking_reference = v_candidate);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'Could not generate a unique booking reference.' using errcode = '55000';
    end if;
  end loop;
  return v_candidate;
end;
$$;
revoke execute on function public.generate_booking_reference() from public, anon, authenticated;
create or replace function public.create_booking_hold(
  p_expert_slug text,
  p_duration_minutes int,
  p_session_format text,
  p_start_at timestamptz,
  p_customer_timezone text default null
)
returns table(booking_id uuid, booking_reference text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_expert_profile_id uuid;
  v_timezone text;
  v_session_type_id uuid;
  v_base_price numeric(12, 2);
  v_currency text;
  v_end_at timestamptz;
  v_local_date date;
  v_local_start time;
  v_local_end time;
  v_reference text;
  v_booking_id uuid;
  v_attempt int := 0;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  if p_duration_minutes is null or p_duration_minutes not in (15, 30, 45, 60, 90) then
    raise exception 'Invalid session duration.' using errcode = '22023';
  end if;
  if p_session_format is null or p_session_format not in ('online', 'in_person') then
    raise exception 'Invalid session format.' using errcode = '22023';
  end if;
  if p_start_at is null then
    raise exception 'A start time is required.' using errcode = '22023';
  end if;
  select ep.id, s.timezone
    into v_expert_profile_id, v_timezone
  from public.expert_profiles ep
  join public.expert_availability_settings s on s.expert_profile_id = ep.id
  where ep.slug = p_expert_slug
    and ep.profile_status = 'published'
    and ep.application_status = 'approved';
  if v_expert_profile_id is null then
    raise exception 'This expert is not currently accepting bookings.' using errcode = '23514';
  end if;
  select id, base_price, currency
    into v_session_type_id, v_base_price, v_currency
  from public.expert_session_types
  where expert_profile_id = v_expert_profile_id
    and duration_minutes = p_duration_minutes
    and is_active
    and (
      (p_session_format = 'online' and online_enabled)
      or (p_session_format = 'in_person' and in_person_enabled)
    );
  if v_session_type_id is null then
    raise exception 'That session length or format is not available for this expert.' using errcode = '23514';
  end if;
  v_end_at := p_start_at + make_interval(mins => p_duration_minutes);
  if p_start_at < now() + make_interval(hours => public.booking_min_notice_hours()) then
    raise exception 'That time no longer meets the minimum booking notice.' using errcode = '23514';
  end if;
  if p_start_at > now() + make_interval(days => public.booking_horizon_days()) then
    raise exception 'That time is too far in the future to book yet.' using errcode = '23514';
  end if;
  v_local_date := (p_start_at at time zone v_timezone)::date;
  v_local_start := (p_start_at at time zone v_timezone)::time;
  v_local_end := (v_end_at at time zone v_timezone)::time;
  if v_local_end <= v_local_start then
    raise exception 'That time is no longer available.' using errcode = '23514';
  end if;
  if not public.expert_window_is_available(v_expert_profile_id, v_local_date, v_local_start, v_local_end) then
    raise exception 'That time is no longer available.' using errcode = '23514';
  end if;
  update public.bookings
    set booking_status = 'expired'
    where booking_status in ('held', 'awaiting_payment')
      and hold_expires_at <= now()
      and (expert_profile_id = v_expert_profile_id or customer_id = v_customer_id);
  loop
    v_attempt := v_attempt + 1;
    v_reference := public.generate_booking_reference();
    begin
      insert into public.bookings (
        booking_reference, customer_id, expert_profile_id, session_type_id,
        duration_minutes, session_format, start_at, end_at,
        expert_timezone, customer_timezone, base_price, currency,
        booking_status, hold_expires_at
      ) values (
        v_reference, v_customer_id, v_expert_profile_id, v_session_type_id,
        p_duration_minutes, p_session_format, p_start_at, v_end_at,
        v_timezone, p_customer_timezone, v_base_price, v_currency,
        'held', now() + make_interval(mins => public.booking_hold_minutes())
      )
      returning id into v_booking_id;
      exit;
    exception
      when exclusion_violation then
        raise exception 'That time was just taken. Please choose another available time.' using errcode = '23P01';
      when unique_violation then
        if v_attempt > 3 then
          raise;
        end if;
    end;
  end loop;
  booking_id := v_booking_id;
  booking_reference := v_reference;
  return next;
end;
$$;
comment on function public.create_booking_hold(text, int, text, timestamptz, text) is
  'The only way a booking row is created. Resolves customer_id from auth.uid() and expert/session-type/price from server-side lookups only -- never trusts a client-supplied id, price, or end time. Independently revalidates the slot against Phase 4 availability and active bookings regardless of what the frontend displayed.';
revoke execute on function public.create_booking_hold(text, int, text, timestamptz, text) from public, anon;
grant execute on function public.create_booking_hold(text, int, text, timestamptz, text) to authenticated;
create or replace function public.save_booking_intake(
  p_booking_id uuid,
  p_discussion_topic text,
  p_additional_context text,
  p_materials_to_review text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_intake_id uuid;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.bookings
    where id = p_booking_id
      and customer_id = v_customer_id
      and booking_status in ('held', 'awaiting_payment')
  ) then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if p_discussion_topic is null or char_length(trim(p_discussion_topic)) = 0 then
    raise exception 'Please tell your expert what you''d like to discuss.' using errcode = '22023';
  end if;
  if char_length(p_discussion_topic) > 500 then
    raise exception 'Discussion topic must be 500 characters or fewer.' using errcode = '22023';
  end if;
  if p_additional_context is null or char_length(trim(p_additional_context)) = 0 then
    raise exception 'Please give your expert some context before the session.' using errcode = '22023';
  end if;
  if char_length(p_additional_context) > 1500 then
    raise exception 'Additional context must be 1500 characters or fewer.' using errcode = '22023';
  end if;
  if p_materials_to_review is not null and char_length(p_materials_to_review) > 1000 then
    raise exception 'Materials to review must be 1000 characters or fewer.' using errcode = '22023';
  end if;
  insert into public.booking_intake (booking_id, discussion_topic, additional_context, materials_to_review)
  values (p_booking_id, p_discussion_topic, p_additional_context, nullif(p_materials_to_review, ''))
  on conflict (booking_id) do update
    set discussion_topic = excluded.discussion_topic,
        additional_context = excluded.additional_context,
        materials_to_review = excluded.materials_to_review
  returning id into v_intake_id;
  return v_intake_id;
end;
$$;
comment on function public.save_booking_intake(uuid, text, text, text) is
  'The only write path for booking_intake. Ownership re-derived from auth.uid() against the target booking''s customer_id every call -- never trusts a client-supplied booking_id alone.';
revoke execute on function public.save_booking_intake(uuid, text, text, text) from public, anon;
grant execute on function public.save_booking_intake(uuid, text, text, text) to authenticated;
create or replace function public.advance_booking_to_awaiting_payment(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
  v_has_intake boolean;
  v_profile_complete boolean;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select * into v_booking
  from public.bookings
  where id = p_booking_id and customer_id = v_customer_id
  for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status = 'awaiting_payment' and v_booking.hold_expires_at > now() then
    update public.bookings
      set hold_expires_at = now() + make_interval(mins => public.booking_hold_minutes())
      where id = p_booking_id;
    return;
  end if;
  if v_booking.booking_status <> 'held' then
    raise exception 'Your reservation is no longer active.' using errcode = '23514';
  end if;
  if v_booking.hold_expires_at <= now() then
    update public.bookings set booking_status = 'expired' where id = p_booking_id;
    raise exception 'Your reserved time expired.' using errcode = '23514';
  end if;
  select exists(select 1 from public.booking_intake where booking_id = p_booking_id)
    into v_has_intake;
  if not v_has_intake then
    raise exception 'Please complete your session details first.' using errcode = '23514';
  end if;
  select exists (
    select 1 from public.customer_profiles cp
    where cp.user_id = v_customer_id
      and cp."current_role" is not null and char_length(trim(cp."current_role")) > 0
      and cp.employment_type is not null
      and cp.industry_id is not null
      and cp.years_experience_range is not null
  ) into v_profile_complete;
  if not v_profile_complete then
    raise exception 'Please complete your professional profile first.' using errcode = '23514';
  end if;
  update public.bookings
    set booking_status = 'awaiting_payment',
        hold_expires_at = now() + make_interval(mins => public.booking_hold_minutes())
    where id = p_booking_id;
end;
$$;
comment on function public.advance_booking_to_awaiting_payment(uuid) is
  'held -> awaiting_payment only, with a fresh hold_expires_at (spec section 38). Never writes confirmed -- that belongs to a future payment phase. Re-validates hold is still active, intake exists, and the customer''s professional profile is complete before advancing.';
revoke execute on function public.advance_booking_to_awaiting_payment(uuid) from public, anon;
grant execute on function public.advance_booking_to_awaiting_payment(uuid) to authenticated;

-- ===== 035_booking_expert_slug_lookup.sql
create or replace function public.get_expert_slug_for_booking(p_booking_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_slug text;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    return null;
  end if;
  select ep.slug
    into v_slug
  from public.bookings b
  join public.expert_profiles ep on ep.id = b.expert_profile_id
  where b.id = p_booking_id
    and b.customer_id = v_customer_id
    and ep.profile_status = 'published'
    and ep.application_status = 'approved';
  return v_slug;
end;
$$;
comment on function public.get_expert_slug_for_booking(uuid) is
  'Resolves a booking the caller owns to its expert''s public slug, for "Choose Another Time" / resume links only -- never exposes any other expert_profiles column, and returns null for a booking that is not the caller''s own or whose expert is no longer published.';
revoke execute on function public.get_expert_slug_for_booking(uuid) from public, anon;
grant execute on function public.get_expert_slug_for_booking(uuid) to authenticated;

-- ===== 036_payments.sql
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  payment_method text not null default 'manual' check (payment_method in ('manual')),
  expected_amount numeric(12, 2) not null check (expected_amount > 0),
  amount_paid numeric(12, 2) not null check (amount_paid > 0),
  currency text not null default 'ETB',
  bank_used text not null check (char_length(trim(bank_used)) between 1 and 150),
  transaction_reference text not null check (char_length(trim(transaction_reference)) between 1 and 200),
  receipt_path text,
  payment_status text not null default 'pending_verification'
    check (payment_status in (
      'pending_verification', 'verified', 'rejected',
      'initiated', 'paid', 'failed', 'refunded'
    )),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_rejection_reason_required check (
    payment_status <> 'rejected'
    or (rejection_reason is not null and char_length(trim(rejection_reason)) > 0)
  )
);
comment on table public.payments is
  'One row per manual-payment submission attempt against a booking. Multiple rows may exist per booking over time (rejection + resubmission) -- history is never overwritten. The only write path in is submit_manual_payment()/verify_manual_payment()/reject_manual_payment() (038_payment_functions.sql).';
create unique index payments_one_pending_per_booking
  on public.payments (booking_id)
  where (payment_status = 'pending_verification');
create index payments_booking_id_idx on public.payments (booking_id);
create index payments_customer_id_idx on public.payments (customer_id);
create index payments_status_idx on public.payments (payment_status);
create index payments_submitted_at_idx on public.payments (submitted_at);
alter table public.payments enable row level security;
create trigger set_payments_updated_at
  before update on public.payments
  for each row
  execute function public.set_updated_at();
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manual-payment-receipts',
  'manual-payment-receipts',
  false,
  5242880, -- 5 MB hard cap enforced by Storage itself
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- ===== 037_payments_rls.sql
revoke all on public.payments from anon, authenticated;
create policy "payments_select_own"
  on public.payments
  for select
  to authenticated
  using (customer_id = (select auth.uid()));
create policy "payments_select_admin"
  on public.payments
  for select
  to authenticated
  using (public.is_admin());
grant select on public.payments to authenticated;
create policy "payment_receipt_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'manual-payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "payment_receipt_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'manual-payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "payment_receipt_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'manual-payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'manual-payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "payment_receipt_select_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'manual-payment-receipts'
    and public.is_admin()
  );

-- ===== 038_payment_functions.sql
create or replace function public.manual_payment_verification_hold_hours()
returns int
language sql
immutable
set search_path = public
as $$ select 24; $$;
revoke execute on function public.manual_payment_verification_hold_hours() from public, anon, authenticated;
create or replace function public.submit_manual_payment(
  p_booking_reference text,
  p_bank_used text,
  p_transaction_reference text,
  p_amount_paid numeric,
  p_receipt_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
  v_bank_used text;
  v_transaction_reference text;
  v_payment_id uuid;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select * into v_booking
  from public.bookings
  where booking_reference = p_booking_reference
    and customer_id = v_customer_id
  for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status in ('held', 'awaiting_payment')
    and v_booking.hold_expires_at is not null
    and v_booking.hold_expires_at <= now()
  then
    update public.bookings set booking_status = 'expired' where id = v_booking.id;
    raise exception 'Your reserved time expired. Please choose another available time.' using errcode = '23514';
  end if;
  if v_booking.booking_status = 'held' then
    raise exception 'Please complete your booking details first.' using errcode = '23514';
  end if;
  if v_booking.booking_status <> 'awaiting_payment' then
    raise exception 'This booking is no longer awaiting payment.' using errcode = '23514';
  end if;
  v_bank_used := trim(p_bank_used);
  if v_bank_used = '' or char_length(v_bank_used) > 150 then
    raise exception 'Please enter the bank you transferred from.' using errcode = '22023';
  end if;
  v_transaction_reference := trim(p_transaction_reference);
  if v_transaction_reference = '' or char_length(v_transaction_reference) > 200 then
    raise exception 'Please enter your transaction or reference ID.' using errcode = '22023';
  end if;
  if p_amount_paid is null or p_amount_paid <= 0 then
    raise exception 'Please enter the amount you paid.' using errcode = '22023';
  end if;
  begin
    insert into public.payments (
      booking_id, customer_id, payment_method,
      expected_amount, amount_paid, currency,
      bank_used, transaction_reference, receipt_path,
      payment_status
    ) values (
      v_booking.id, v_customer_id, 'manual',
      v_booking.base_price, p_amount_paid, v_booking.currency,
      v_bank_used, v_transaction_reference, p_receipt_path,
      'pending_verification'
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      select id into v_payment_id
      from public.payments
      where booking_id = v_booking.id and payment_status = 'pending_verification'
      order by submitted_at desc
      limit 1;
  end;
  update public.bookings
    set hold_expires_at = now() + make_interval(hours => public.manual_payment_verification_hold_hours())
    where id = v_booking.id;
  return v_payment_id;
end;
$$;
comment on function public.submit_manual_payment(text, text, text, numeric, text) is
  'The only way a payments row is created. Resolves customer_id and expected_amount from the caller''s own booking -- never trusts a client-supplied amount, booking, or customer. Extends bookings.hold_expires_at to the manual-verification window; never confirms the booking.';
revoke execute on function public.submit_manual_payment(text, text, text, numeric, text) from public, anon;
grant execute on function public.submit_manual_payment(text, text, text, numeric, text) to authenticated;
create or replace function public.verify_manual_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Payment not found.' using errcode = '42501';
  end if;
  if v_payment.payment_status <> 'pending_verification' then
    raise exception 'This payment is no longer pending verification.' using errcode = '23514';
  end if;
  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if v_booking.id is null or v_booking.booking_status <> 'awaiting_payment' then
    raise exception 'This booking is no longer awaiting payment.' using errcode = '23514';
  end if;
  update public.payments
    set payment_status = 'verified',
        verified_at = now(),
        verified_by = v_admin_id
    where id = p_payment_id;
  update public.bookings
    set booking_status = 'confirmed',
        hold_expires_at = null
    where id = v_payment.booking_id;
end;
$$;
comment on function public.verify_manual_payment(uuid) is
  'Admin-only. Atomically transitions pending_verification -> verified AND awaiting_payment -> confirmed in one transaction. Re-checks both current states first so a stale admin action (payment or booking already moved on) fails safely instead of double-applying.';
revoke execute on function public.verify_manual_payment(uuid) from public, anon;
grant execute on function public.verify_manual_payment(uuid) to authenticated;
create or replace function public.reject_manual_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_reason text;
  v_payment public.payments%rowtype;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  v_reason := trim(p_reason);
  if v_reason = '' then
    raise exception 'Please explain why this payment is being rejected.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'Rejection reason must be 2000 characters or fewer.' using errcode = '22023';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Payment not found.' using errcode = '42501';
  end if;
  if v_payment.payment_status <> 'pending_verification' then
    raise exception 'This payment is no longer pending verification.' using errcode = '23514';
  end if;
  update public.payments
    set payment_status = 'rejected',
        rejection_reason = v_reason,
        verified_at = now(),
        verified_by = v_admin_id
    where id = p_payment_id;
end;
$$;
comment on function public.reject_manual_payment(uuid, text) is
  'Admin-only. pending_verification -> rejected, with a required reason. Never changes booking_status -- the booking stays awaiting_payment so the customer can resubmit.';
revoke execute on function public.reject_manual_payment(uuid, text) from public, anon;
grant execute on function public.reject_manual_payment(uuid, text) to authenticated;

-- ===== 039_expert_session_access.sql
create policy "bookings_select_own_expert"
  on public.bookings
  for select
  to authenticated
  using (
    booking_status in ('confirmed', 'completed')
    and expert_profile_id in (
      select id from public.expert_profiles where user_id = (select auth.uid())
    )
  );
create policy "booking_intake_select_expert"
  on public.booking_intake
  for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      join public.expert_profiles ep on ep.id = b.expert_profile_id
      where b.id = booking_intake.booking_id
        and ep.user_id = (select auth.uid())
        and b.booking_status in ('confirmed', 'completed')
    )
  );
create or replace function public.get_customer_context_for_booking(p_booking_id uuid)
returns table(
  full_name text,
  "current_role" text,
  employment_type text,
  company_name text,
  industry_name text,
  years_experience_range text,
  linkedin_url text
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_expert_user_id uuid;
  v_booking public.bookings%rowtype;
begin
  v_expert_user_id := auth.uid();
  if v_expert_user_id is null then
    return;
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return;
  end if;
  if v_booking.booking_status not in ('confirmed', 'completed') then
    return;
  end if;
  if not exists (
    select 1 from public.expert_profiles ep
    where ep.id = v_booking.expert_profile_id
      and ep.user_id = v_expert_user_id
  ) then
    return;
  end if;
  return query
    select
      p.full_name,
      cp.current_role,
      cp.employment_type,
      cp.company_name,
      ind.name as industry_name,
      cp.years_experience_range,
      cp.linkedin_url
    from public.profiles p
    left join public.customer_profiles cp on cp.user_id = p.id
    left join public.industries ind on ind.id = cp.industry_id
    where p.id = v_booking.customer_id;
end;
$$;
comment on function public.get_customer_context_for_booking(uuid) is
  'The only way an expert reads any customer professional-profile data. Re-derives the expert''s identity from auth.uid(), re-validates booking ownership and confirmed/completed status internally, and returns only the minimal fields a session-preparation view needs -- never email/phone/auth identifiers/payment data/other bookings. Returns zero rows for any booking that is not the caller''s own confirmed/completed booking, indistinguishable from a booking that does not exist.';
revoke execute on function public.get_customer_context_for_booking(uuid) from public, anon;
grant execute on function public.get_customer_context_for_booking(uuid) to authenticated;

-- ===== 040_session_dashboard_repair.sql
create or replace function public.get_expert_context_for_booking(p_booking_id uuid)
returns table(
  full_name text,
  headline text,
  profile_image_path text,
  slug text
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    return;
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return;
  end if;
  if v_booking.customer_id <> v_customer_id then
    return;
  end if;
  return query
    select p.full_name, ep.headline, ep.profile_image_path, ep.slug
    from public.expert_profiles ep
    join public.profiles p on p.id = ep.user_id
    where ep.id = v_booking.expert_profile_id;
end;
$$;
comment on function public.get_expert_context_for_booking(uuid) is
  'The only way a customer reads expert_profiles data for a booking they own, regardless of the expert''s current publish status. Re-validates booking.customer_id = auth.uid() internally. Returns only full_name, headline, profile_image_path, slug -- never any other application field. Returns zero rows for any booking that is not the caller''s own, indistinguishable from a booking that does not exist.';
revoke execute on function public.get_expert_context_for_booking(uuid) from public, anon;
grant execute on function public.get_expert_context_for_booking(uuid) to authenticated;
create or replace function public.is_booked_expert_photo(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.expert_profiles ep on ep.id = b.expert_profile_id
    where ep.profile_image_path = object_name
      and b.customer_id = auth.uid()
  );
$$;
revoke execute on function public.is_booked_expert_photo(text) from public, anon;
grant execute on function public.is_booked_expert_photo(text) to authenticated;
create policy "expert_photo_select_booked_customer"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'expert-profile-images'
    and public.is_booked_expert_photo(storage.objects.name)
  );

-- ===== 041_reservation_release_and_grace.sql
create or replace function public.payment_rejection_grace_minutes()
returns int
language sql
immutable
set search_path = public
as $$ select 120; $$;
revoke execute on function public.payment_rejection_grace_minutes() from public, anon, authenticated;
create or replace function public.reject_manual_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_reason text;
  v_payment public.payments%rowtype;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  v_reason := trim(p_reason);
  if v_reason = '' then
    raise exception 'Please explain why this payment is being rejected.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'Rejection reason must be 2000 characters or fewer.' using errcode = '22023';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Payment not found.' using errcode = '42501';
  end if;
  if v_payment.payment_status <> 'pending_verification' then
    raise exception 'This payment is no longer pending verification.' using errcode = '23514';
  end if;
  update public.payments
    set payment_status = 'rejected',
        rejection_reason = v_reason,
        verified_at = now(),
        verified_by = v_admin_id
    where id = p_payment_id;
  update public.bookings
    set hold_expires_at = now() + make_interval(mins => public.payment_rejection_grace_minutes())
    where id = v_payment.booking_id;
end;
$$;
comment on function public.reject_manual_payment(uuid, text) is
  'Admin-only. pending_verification -> rejected, with a required reason. Never changes booking_status -- the booking stays awaiting_payment so the customer can resubmit -- but sets a fresh, short (payment_rejection_grace_minutes()) hold_expires_at from the moment of rejection, replacing whatever was left of the original verification-hold window, so a rejected booking is never held indefinitely.';
revoke execute on function public.reject_manual_payment(uuid, text) from public, anon;
grant execute on function public.reject_manual_payment(uuid, text) to authenticated;
create or replace function public.release_booking_reservation(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select * into v_booking
  from public.bookings
  where id = p_booking_id and customer_id = v_customer_id
  for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status not in ('held', 'awaiting_payment') then
    raise exception 'This booking can no longer be released.' using errcode = '23514';
  end if;
  update public.bookings
    set booking_status = 'expired',
        hold_expires_at = now()
    where id = p_booking_id;
end;
$$;
comment on function public.release_booking_reservation(uuid) is
  'Customer self-service release of their OWN held/awaiting_payment booking -- never a booking that is already confirmed. Ownership re-derived from auth.uid() every call. Immediately flips booking_status to expired so the slot opens right away, not after waiting out any hold. Any payment history on the booking is left untouched.';
revoke execute on function public.release_booking_reservation(uuid) from public, anon;
grant execute on function public.release_booking_reservation(uuid) to authenticated;
create or replace function public.admin_release_booking_reservation(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_booking public.bookings%rowtype;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status not in ('held', 'awaiting_payment') then
    raise exception 'This booking is not an active reservation.' using errcode = '23514';
  end if;
  update public.bookings
    set booking_status = 'expired',
        hold_expires_at = now()
    where id = p_booking_id;
end;
$$;
comment on function public.admin_release_booking_reservation(uuid) is
  'Admin-only. Terminates a stuck/rejected unconfirmed reservation (held/awaiting_payment only -- never confirmed) immediately, freeing the slot. Payment history is left untouched; this is not cancellation or a refund.';
revoke execute on function public.admin_release_booking_reservation(uuid) from public, anon;
grant execute on function public.admin_release_booking_reservation(uuid) to authenticated;

-- ===== 042_chapa_payments.sql
alter table public.payments
  drop constraint payments_payment_method_check,
  add constraint payments_payment_method_check check (payment_method in ('manual', 'chapa'));
alter table public.payments
  alter column bank_used drop not null,
  alter column transaction_reference drop not null;
alter table public.payments
  drop constraint payments_bank_used_check,
  drop constraint payments_transaction_reference_check;
alter table public.payments
  add constraint payments_bank_used_required_for_manual check (
    (payment_method = 'manual' and bank_used is not null and char_length(trim(bank_used)) between 1 and 150)
    or (payment_method <> 'manual' and (bank_used is null or char_length(bank_used) <= 150))
  ),
  add constraint payments_transaction_reference_required_for_manual check (
    (payment_method = 'manual' and transaction_reference is not null and char_length(trim(transaction_reference)) between 1 and 200)
    or (payment_method <> 'manual' and (transaction_reference is null or char_length(transaction_reference) <= 200))
  );
alter table public.payments
  drop constraint payments_payment_status_check,
  add constraint payments_payment_status_check check (payment_status in (
    'pending_verification', 'verified', 'rejected',
    'initiated', 'paid', 'failed', 'refunded', 'requires_review'
  ));
alter table public.payments
  add column provider_tx_ref text,
  add column provider_reference text,
  add column provider_status text,
  add column provider_mode text check (provider_mode is null or provider_mode in ('test', 'live')),
  add column initialized_at timestamptz;
alter table public.payments
  add constraint payments_provider_tx_ref_required_for_chapa check (
    (payment_method = 'chapa' and provider_tx_ref is not null)
    or (payment_method <> 'chapa' and provider_tx_ref is null)
  ),
  add constraint payments_provider_tx_ref_length check (provider_tx_ref is null or char_length(provider_tx_ref) <= 60);
comment on column public.payments.provider_tx_ref is
  'Pivotroom-generated unique reference sent to Chapa as tx_ref (spec section 5) -- never the booking UUID directly, never reused across attempts. Generated by generate_chapa_tx_ref(), set once by create_chapa_payment_attempt(), never updated afterward.';
comment on column public.payments.provider_reference is
  'Chapa''s own returned reference for this transaction (their data.reference, if present in the verify response) -- display/audit only.';
comment on column public.payments.provider_status is
  'Last raw status string Chapa reported for this transaction (their data.status) -- display/audit only, NEVER the source of truth for payment_status. A payment_status transition only ever happens inside finalize_chapa_payment() after this project''s own server code has independently called Chapa''s Verify Transaction API.';
comment on column public.payments.provider_mode is
  'Which Chapa key family (test/live) this attempt was initialized and verified under, derived server-side from the configured CHAPA_SECRET_KEY -- never mixed across modes for the same attempt.';
create unique index payments_one_active_chapa_per_booking
  on public.payments (booking_id)
  where (payment_method = 'chapa' and payment_status = 'initiated');
create unique index payments_provider_tx_ref_unique
  on public.payments (provider_tx_ref)
  where (provider_tx_ref is not null);
create index payments_payment_method_idx on public.payments (payment_method);
create or replace function public.chapa_checkout_hold_minutes()
returns int
language sql
immutable
set search_path = public
as $$ select 30; $$;
revoke execute on function public.chapa_checkout_hold_minutes() from public, anon, authenticated;
create or replace function public.generate_chapa_tx_ref()
returns text
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_candidate text;
  v_i int;
  v_attempt int := 0;
begin
  loop
    v_candidate := 'PR-CH-';
    for v_i in 1..8 loop
      v_candidate := v_candidate || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.payments where provider_tx_ref = v_candidate);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'Could not generate a unique Chapa transaction reference.' using errcode = '55000';
    end if;
  end loop;
  return v_candidate;
end;
$$;
revoke execute on function public.generate_chapa_tx_ref() from public, anon, authenticated;
create or replace function public.create_chapa_payment_attempt(
  p_booking_reference text,
  p_provider_mode text default null
)
returns table (payment_id uuid, provider_tx_ref text, expected_amount numeric, currency text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
  v_existing public.payments%rowtype;
  v_tx_ref text;
  v_payment_id uuid;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select * into v_booking
  from public.bookings
  where booking_reference = p_booking_reference and customer_id = v_customer_id
  for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status in ('held', 'awaiting_payment')
    and v_booking.hold_expires_at is not null
    and v_booking.hold_expires_at <= now()
  then
    update public.bookings set booking_status = 'expired' where id = v_booking.id;
    raise exception 'Your reserved time expired. Please choose another available time.' using errcode = '23514';
  end if;
  if v_booking.booking_status = 'held' then
    raise exception 'Please complete your booking details first.' using errcode = '23514';
  end if;
  if v_booking.booking_status <> 'awaiting_payment' then
    raise exception 'This booking is no longer awaiting payment.' using errcode = '23514';
  end if;
  select * into v_existing
  from public.payments
  where booking_id = v_booking.id and payment_method = 'chapa' and payment_status = 'initiated'
  limit 1;
  if v_existing.id is not null then
    payment_id := v_existing.id;
    provider_tx_ref := v_existing.provider_tx_ref;
    expected_amount := v_existing.expected_amount;
    currency := v_existing.currency;
    return next;
    return;
  end if;
  v_tx_ref := public.generate_chapa_tx_ref();
  begin
    insert into public.payments (
      booking_id, customer_id, payment_method,
      expected_amount, amount_paid, currency,
      payment_status, provider_tx_ref, provider_mode, initialized_at
    ) values (
      v_booking.id, v_customer_id, 'chapa',
      v_booking.base_price, v_booking.base_price, v_booking.currency,
      'initiated', v_tx_ref, p_provider_mode, now()
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      select id into v_payment_id
      from public.payments
      where booking_id = v_booking.id and payment_method = 'chapa' and payment_status = 'initiated'
      order by created_at desc
      limit 1;
  end;
  update public.bookings
    set hold_expires_at = now() + make_interval(mins => public.chapa_checkout_hold_minutes())
    where id = v_booking.id;
  payment_id := v_payment_id;
  provider_tx_ref := v_tx_ref;
  expected_amount := v_booking.base_price;
  currency := v_booking.currency;
  return next;
end;
$$;
comment on function public.create_chapa_payment_attempt(text, text) is
  'The only way a payment_method=chapa row is created. Resolves customer_id and expected_amount from the caller''s own awaiting_payment booking -- never trusts a client-supplied amount. Extends bookings.hold_expires_at to the Chapa checkout window. Idempotent: reuses an existing initiated attempt instead of creating a duplicate.';
revoke execute on function public.create_chapa_payment_attempt(text, text) from public, anon;
grant execute on function public.create_chapa_payment_attempt(text, text) to authenticated;
create or replace function public.mark_own_chapa_payment_failed(
  p_payment_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  update public.payments
    set payment_status = 'failed',
        provider_status = coalesce(p_reason, 'initialization_failed')
    where id = p_payment_id
      and customer_id = v_customer_id
      and payment_method = 'chapa'
      and payment_status = 'initiated';
end;
$$;
comment on function public.mark_own_chapa_payment_failed(uuid, text) is
  'Customer-owned. Flips ONE of the caller''s own still-initiated Chapa attempts to failed -- used only when the Chapa initialize HTTP call itself failed after the local row was already created. No-op if the row is not the caller''s, not chapa, or already left the initiated state.';
revoke execute on function public.mark_own_chapa_payment_failed(uuid, text) from public, anon;
grant execute on function public.mark_own_chapa_payment_failed(uuid, text) to authenticated;
create or replace function public.finalize_chapa_payment(
  p_provider_tx_ref text,
  p_verified_status text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_provider_reference text default null,
  p_provider_mode text default null
)
returns table (final_payment_status text, final_booking_status text, newly_finalized boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_payment from public.payments where provider_tx_ref = p_provider_tx_ref for update;
  if v_payment.id is null then
    raise exception 'Unknown Chapa transaction reference.' using errcode = '42501';
  end if;
  if v_payment.payment_status in ('verified', 'failed', 'requires_review') then
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := v_payment.payment_status;
    final_booking_status := v_booking.booking_status;
    newly_finalized := false;
    return next;
    return;
  end if;
  update public.payments
    set provider_status = p_verified_status,
        provider_reference = coalesce(p_provider_reference, provider_reference),
        provider_mode = coalesce(p_provider_mode, provider_mode)
    where id = v_payment.id;
  if p_verified_status = 'pending' then
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'initiated';
    final_booking_status := v_booking.booking_status;
    newly_finalized := false;
    return next;
    return;
  end if;
  if p_verified_status <> 'success' then
    update public.payments set payment_status = 'failed' where id = v_payment.id;
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'failed';
    final_booking_status := v_booking.booking_status;
    newly_finalized := true;
    return next;
    return;
  end if;
  if p_verified_currency is distinct from v_payment.currency
     or p_verified_amount is distinct from v_payment.expected_amount
  then
    update public.payments set payment_status = 'requires_review' where id = v_payment.id;
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'requires_review';
    final_booking_status := v_booking.booking_status;
    newly_finalized := true;
    return next;
    return;
  end if;
  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if v_booking.booking_status = 'awaiting_payment'
     and (v_booking.hold_expires_at is null or v_booking.hold_expires_at > now())
  then
    update public.payments
      set payment_status = 'verified', verified_at = now()
      where id = v_payment.id;
    update public.bookings
      set booking_status = 'confirmed', hold_expires_at = null
      where id = v_booking.id;
    final_payment_status := 'verified';
    final_booking_status := 'confirmed';
    newly_finalized := true;
    return next;
    return;
  end if;
  update public.payments
    set payment_status = 'requires_review', verified_at = now()
    where id = v_payment.id;
  final_payment_status := 'requires_review';
  final_booking_status := v_booking.booking_status;
  newly_finalized := true;
  return next;
end;
$$;
comment on function public.finalize_chapa_payment(text, text, numeric, text, text, text) is
  'service_role ONLY -- never granted to anon/authenticated. The sole path to payment_status=verified for a Chapa row or booking_status=confirmed from one. Callers must pass p_verified_* facts obtained from Chapa''s own Verify Transaction API, never an untrusted webhook/callback payload directly. Idempotent and race-safe via FOR UPDATE row locking; a payment whose booking is no longer safely confirmable moves to requires_review instead of confirming or silently failing.';
revoke execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text) to service_role;

-- ===== 043_chapa_verified_tx_ref_check.sql
drop function if exists public.finalize_chapa_payment(text, text, numeric, text, text, text);
create or replace function public.finalize_chapa_payment(
  p_provider_tx_ref text,
  p_verified_status text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_verified_tx_ref text default null,
  p_provider_reference text default null,
  p_provider_mode text default null
)
returns table (final_payment_status text, final_booking_status text, newly_finalized boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_payment from public.payments where provider_tx_ref = p_provider_tx_ref for update;
  if v_payment.id is null then
    raise exception 'Unknown Chapa transaction reference.' using errcode = '42501';
  end if;
  if v_payment.payment_status in ('verified', 'failed', 'requires_review') then
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := v_payment.payment_status;
    final_booking_status := v_booking.booking_status;
    newly_finalized := false;
    return next;
    return;
  end if;
  update public.payments
    set provider_status = p_verified_status,
        provider_reference = coalesce(p_provider_reference, provider_reference),
        provider_mode = coalesce(p_provider_mode, provider_mode)
    where id = v_payment.id;
  if p_verified_status = 'pending' then
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'initiated';
    final_booking_status := v_booking.booking_status;
    newly_finalized := false;
    return next;
    return;
  end if;
  if p_verified_status <> 'success' then
    update public.payments set payment_status = 'failed' where id = v_payment.id;
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'failed';
    final_booking_status := v_booking.booking_status;
    newly_finalized := true;
    return next;
    return;
  end if;
  if p_verified_currency is distinct from v_payment.currency
     or p_verified_amount is distinct from v_payment.expected_amount
     or (p_verified_tx_ref is not null and p_verified_tx_ref is distinct from v_payment.provider_tx_ref)
  then
    update public.payments set payment_status = 'requires_review' where id = v_payment.id;
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'requires_review';
    final_booking_status := v_booking.booking_status;
    newly_finalized := true;
    return next;
    return;
  end if;
  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if v_booking.booking_status = 'awaiting_payment'
     and (v_booking.hold_expires_at is null or v_booking.hold_expires_at > now())
  then
    update public.payments
      set payment_status = 'verified', verified_at = now()
      where id = v_payment.id;
    update public.bookings
      set booking_status = 'confirmed', hold_expires_at = null
      where id = v_booking.id;
    final_payment_status := 'verified';
    final_booking_status := 'confirmed';
    newly_finalized := true;
    return next;
    return;
  end if;
  update public.payments
    set payment_status = 'requires_review', verified_at = now()
    where id = v_payment.id;
  final_payment_status := 'requires_review';
  final_booking_status := v_booking.booking_status;
  newly_finalized := true;
  return next;
end;
$$;
comment on function public.finalize_chapa_payment(text, text, numeric, text, text, text, text) is
  'service_role ONLY -- never granted to anon/authenticated. The sole path to payment_status=verified for a Chapa row or booking_status=confirmed from one. Callers must pass p_verified_* facts obtained from Chapa''s own Verify Transaction API, never an untrusted webhook/callback payload directly. p_verified_tx_ref, when the provider response includes one, is checked against the local row''s own provider_tx_ref -- a mismatch is treated the same as an amount/currency mismatch (requires_review), never silently confirmed. Idempotent and race-safe via FOR UPDATE row locking; a payment whose booking is no longer safely confirmable moves to requires_review instead of confirming or silently failing.';
revoke execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text, text) to service_role;

-- ===== 044_phase9_integration_jobs.sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  job_type text not null check (job_type in (
    'booking_confirmation_email_customer',
    'booking_confirmation_email_expert',
    'calendar_create',
    'session_reminder_customer',
    'session_reminder_expert',
    'payment_rejected_email'
  )),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  scheduled_for timestamptz not null default now(),
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
comment on table public.integration_jobs is
  'Outbox for Phase 9 post-confirmation side effects (emails, Calendar/Meet, reminders). Registered atomically inside the same transaction as booking confirmation; processed afterward by a separate worker over HTTP, never inside a DB transaction (spec section 6). No secrets are ever stored here (spec section 52).';
create unique index integration_jobs_dedupe_key_idx on public.integration_jobs (dedupe_key);
create index integration_jobs_worker_idx on public.integration_jobs (scheduled_for)
  where status = 'pending';
create index integration_jobs_booking_id_idx on public.integration_jobs (booking_id);
create trigger integration_jobs_set_updated_at
  before update on public.integration_jobs
  for each row execute function public.set_updated_at();
alter table public.integration_jobs enable row level security;
create policy integration_jobs_select_admin on public.integration_jobs
  for select
  to authenticated
  using (public.is_admin());
alter table public.bookings
  add column calendar_event_id text,
  add column calendar_meeting_url text,
  add column calendar_sync_status text not null default 'not_synced'
    check (calendar_sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  add column calendar_synced_at timestamptz;
comment on column public.bookings.calendar_event_id is
  'Google Calendar event id for this booking, once created. Reused (never re-created) on retry (spec sections 45, 47) -- future rescheduling/cancellation phases update or delete this exact event.';
comment on column public.bookings.calendar_meeting_url is
  'Google Meet URL from the created event''s conferenceData, online sessions only (spec section 24: in-person bookings never get one). Never fabricated client-side.';
comment on column public.bookings.calendar_sync_status is
  'not_synced (no attempt yet) / pending (job registered, not yet run) / synced / failed. Booking confirmation is never gated on this (spec section 2).';
create or replace function public.session_reminder_offsets_minutes()
returns int[]
language sql
immutable
set search_path = public
as $$ select array[1440, 60]; $$; -- 24h, 1h
revoke execute on function public.session_reminder_offsets_minutes() from public, anon, authenticated;
create or replace function public.integration_max_attempts()
returns int
language sql
immutable
set search_path = public
as $$ select 5; $$;
revoke execute on function public.integration_max_attempts() from public, anon, authenticated;
create or replace function public.register_booking_confirmation_jobs(p_booking_id uuid)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_booking public.bookings%rowtype;
  v_offset int;
  v_fire_at timestamptz;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return;
  end if;
  insert into public.integration_jobs (booking_id, job_type, dedupe_key, scheduled_for)
  values
    (p_booking_id, 'booking_confirmation_email_customer', 'confirm_email_customer:' || p_booking_id, now()),
    (p_booking_id, 'booking_confirmation_email_expert', 'confirm_email_expert:' || p_booking_id, now()),
    (p_booking_id, 'calendar_create', 'calendar_create:' || p_booking_id, now())
  on conflict (dedupe_key) do nothing;
  foreach v_offset in array public.session_reminder_offsets_minutes()
  loop
    v_fire_at := v_booking.start_at - make_interval(mins => v_offset);
    if v_fire_at > now() then
      insert into public.integration_jobs (booking_id, job_type, payload, dedupe_key, scheduled_for)
      values
        (p_booking_id, 'session_reminder_customer', jsonb_build_object('offset_minutes', v_offset),
         'reminder_customer_' || v_offset || ':' || p_booking_id, v_fire_at),
        (p_booking_id, 'session_reminder_expert', jsonb_build_object('offset_minutes', v_offset),
         'reminder_expert_' || v_offset || ':' || p_booking_id, v_fire_at)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
end;
$$;
comment on function public.register_booking_confirmation_jobs(uuid) is
  'Internal only. Registers the fixed set of Phase 9 outbox jobs for a newly-confirmed booking, idempotently (ON CONFLICT on dedupe_key). Called from inside verify_manual_payment()/finalize_chapa_payment() in the same transaction as the confirmation itself, and from admin_backfill_booking_integrations() for controlled backfill of pre-Phase-9 confirmed bookings.';
revoke execute on function public.register_booking_confirmation_jobs(uuid) from public, anon, authenticated;
create or replace function public.register_payment_rejected_job(p_payment_id uuid)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_booking_id uuid;
begin
  select booking_id into v_booking_id from public.payments where id = p_payment_id;
  if v_booking_id is null then
    return;
  end if;
  insert into public.integration_jobs (booking_id, payment_id, job_type, dedupe_key, scheduled_for)
  values (v_booking_id, p_payment_id, 'payment_rejected_email', 'payment_rejected:' || p_payment_id, now())
  on conflict (dedupe_key) do nothing;
end;
$$;
comment on function public.register_payment_rejected_job(uuid) is
  'Internal only. Registers one payment_rejected_email job, idempotently. Called from reject_manual_payment() in the same transaction as the rejection itself.';
revoke execute on function public.register_payment_rejected_job(uuid) from public, anon, authenticated;
create or replace function public.verify_manual_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Payment not found.' using errcode = '42501';
  end if;
  if v_payment.payment_status <> 'pending_verification' then
    raise exception 'This payment is no longer pending verification.' using errcode = '23514';
  end if;
  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if v_booking.id is null or v_booking.booking_status <> 'awaiting_payment' then
    raise exception 'This booking is no longer awaiting payment.' using errcode = '23514';
  end if;
  update public.payments
    set payment_status = 'verified',
        verified_at = now(),
        verified_by = v_admin_id
    where id = p_payment_id;
  update public.bookings
    set booking_status = 'confirmed',
        hold_expires_at = null
    where id = v_booking.id;
  perform public.register_booking_confirmation_jobs(v_booking.id);
end;
$$;
comment on function public.verify_manual_payment(uuid) is
  'Admin-only. Atomically transitions pending_verification -> verified AND awaiting_payment -> confirmed in one transaction, then registers Phase 9 side-effect jobs in that same transaction. Re-checks both current states first so a stale admin action fails safely instead of double-applying.';
revoke execute on function public.verify_manual_payment(uuid) from public, anon;
grant execute on function public.verify_manual_payment(uuid) to authenticated;
create or replace function public.reject_manual_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_reason text;
  v_payment public.payments%rowtype;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  v_reason := trim(p_reason);
  if v_reason = '' then
    raise exception 'Please explain why this payment is being rejected.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'Rejection reason must be 2000 characters or fewer.' using errcode = '22023';
  end if;
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Payment not found.' using errcode = '42501';
  end if;
  if v_payment.payment_status <> 'pending_verification' then
    raise exception 'This payment is no longer pending verification.' using errcode = '23514';
  end if;
  update public.payments
    set payment_status = 'rejected',
        rejection_reason = v_reason,
        verified_at = now(),
        verified_by = v_admin_id
    where id = p_payment_id;
  perform public.register_payment_rejected_job(p_payment_id);
end;
$$;
comment on function public.reject_manual_payment(uuid, text) is
  'Admin-only. pending_verification -> rejected, with a required reason, then registers one payment_rejected_email job in the same transaction. Never changes booking_status -- the booking stays awaiting_payment so the customer can resubmit.';
revoke execute on function public.reject_manual_payment(uuid, text) from public, anon;
grant execute on function public.reject_manual_payment(uuid, text) to authenticated;
create or replace function public.finalize_chapa_payment(
  p_provider_tx_ref text,
  p_verified_status text,
  p_verified_amount numeric,
  p_verified_currency text,
  p_verified_tx_ref text default null,
  p_provider_reference text default null,
  p_provider_mode text default null
)
returns table (final_payment_status text, final_booking_status text, newly_finalized boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select * into v_payment from public.payments where provider_tx_ref = p_provider_tx_ref for update;
  if v_payment.id is null then
    raise exception 'Unknown Chapa transaction reference.' using errcode = '42501';
  end if;
  if v_payment.payment_status in ('verified', 'failed', 'requires_review') then
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := v_payment.payment_status;
    final_booking_status := v_booking.booking_status;
    newly_finalized := false;
    return next;
    return;
  end if;
  update public.payments
    set provider_status = p_verified_status,
        provider_reference = coalesce(p_provider_reference, provider_reference),
        provider_mode = coalesce(p_provider_mode, provider_mode)
    where id = v_payment.id;
  if p_verified_status = 'pending' then
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'initiated';
    final_booking_status := v_booking.booking_status;
    newly_finalized := false;
    return next;
    return;
  end if;
  if p_verified_status <> 'success' then
    update public.payments set payment_status = 'failed' where id = v_payment.id;
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'failed';
    final_booking_status := v_booking.booking_status;
    newly_finalized := true;
    return next;
    return;
  end if;
  if p_verified_currency is distinct from v_payment.currency
     or p_verified_amount is distinct from v_payment.expected_amount
     or (p_verified_tx_ref is not null and p_verified_tx_ref is distinct from v_payment.provider_tx_ref)
  then
    update public.payments set payment_status = 'requires_review' where id = v_payment.id;
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'requires_review';
    final_booking_status := v_booking.booking_status;
    newly_finalized := true;
    return next;
    return;
  end if;
  select * into v_booking from public.bookings where id = v_payment.booking_id for update;
  if v_booking.booking_status = 'awaiting_payment'
     and (v_booking.hold_expires_at is null or v_booking.hold_expires_at > now())
  then
    update public.payments
      set payment_status = 'verified', verified_at = now()
      where id = v_payment.id;
    update public.bookings
      set booking_status = 'confirmed', hold_expires_at = null
      where id = v_booking.id;
    perform public.register_booking_confirmation_jobs(v_booking.id);
    final_payment_status := 'verified';
    final_booking_status := 'confirmed';
    newly_finalized := true;
    return next;
    return;
  end if;
  update public.payments
    set payment_status = 'requires_review', verified_at = now()
    where id = v_payment.id;
  final_payment_status := 'requires_review';
  final_booking_status := v_booking.booking_status;
  newly_finalized := true;
  return next;
end;
$$;
comment on function public.finalize_chapa_payment(text, text, numeric, text, text, text, text) is
  'service_role ONLY. Same as 043, plus registering Phase 9 side-effect jobs in the same transaction as the booking confirmation itself (never in the failed/pending/requires_review branches). Idempotent and race-safe via FOR UPDATE row locking.';
revoke execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text, text) to service_role;
create or replace function public.get_booking_notification_context(p_booking_id uuid)
returns table (
  booking_reference text,
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes int,
  session_format text,
  customer_id uuid,
  customer_email text,
  customer_full_name text,
  customer_timezone text,
  expert_user_id uuid,
  expert_email text,
  expert_full_name text,
  expert_timezone text,
  discussion_topic text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    b.booking_reference,
    b.start_at,
    b.end_at,
    b.duration_minutes,
    b.session_format,
    b.customer_id,
    cu.email,
    cp.full_name,
    b.customer_timezone,
    ep.user_id,
    eu.email,
    epr.full_name,
    b.expert_timezone,
    bi.discussion_topic
  from public.bookings b
  join public.profiles cp on cp.id = b.customer_id
  join auth.users cu on cu.id = b.customer_id
  join public.expert_profiles ep on ep.id = b.expert_profile_id
  join public.profiles epr on epr.id = ep.user_id
  join auth.users eu on eu.id = ep.user_id
  left join public.booking_intake bi on bi.booking_id = b.id
  where b.id = p_booking_id;
$$;
comment on function public.get_booking_notification_context(uuid) is
  'service_role ONLY -- resolves every field a Phase 9 email/calendar job needs for one booking, server-side. Never callable by anon/authenticated (email addresses would otherwise leak through it). discussion_topic is included only because the expert confirmation/reminder emails legitimately need it (spec sections 15, 41) -- callers building the customer-facing emails simply do not read that field back out.';
revoke execute on function public.get_booking_notification_context(uuid) from public, anon, authenticated;
grant execute on function public.get_booking_notification_context(uuid) to service_role;
create or replace function public.admin_retry_integration_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  update public.integration_jobs
    set status = 'pending',
        attempt_count = 0,
        scheduled_for = now(),
        last_error = null
    where id = p_job_id
      and status = 'failed';
end;
$$;
comment on function public.admin_retry_integration_job(uuid) is
  'Admin-only. Resets one FAILED job back to pending for the worker to pick up again. No-op if the job is not currently failed (pending/processing/completed jobs are never touched).';
revoke execute on function public.admin_retry_integration_job(uuid) from public, anon;
grant execute on function public.admin_retry_integration_job(uuid) to authenticated;
create or replace function public.admin_backfill_booking_integrations(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  select booking_status into v_status from public.bookings where id = p_booking_id;
  if v_status is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_status <> 'confirmed' then
    raise exception 'Only a confirmed booking can have integrations backfilled.' using errcode = '23514';
  end if;
  perform public.register_booking_confirmation_jobs(p_booking_id);
end;
$$;
comment on function public.admin_backfill_booking_integrations(uuid) is
  'Admin-only, explicit, one booking at a time. Registers Phase 9 jobs for a booking that was already confirmed before this migration -- idempotent, same as any other registration call, so re-running it is safe.';
revoke execute on function public.admin_backfill_booking_integrations(uuid) from public, anon;
grant execute on function public.admin_backfill_booking_integrations(uuid) to authenticated;

-- ===== 045_phase10_reschedule_cancellation.sql
create or replace function public.customer_reschedule_cutoff_hours()
returns int
language sql
immutable
set search_path = public
as $$ select 24; $$;
revoke execute on function public.customer_reschedule_cutoff_hours() from public, anon, authenticated;
create or replace function public.customer_cancel_cutoff_hours()
returns int
language sql
immutable
set search_path = public
as $$ select 24; $$;
revoke execute on function public.customer_cancel_cutoff_hours() from public, anon, authenticated;
create table public.booking_reschedules (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  initiated_by_user_id uuid not null references public.profiles (id),
  actor_type text not null check (actor_type in ('customer', 'admin')),
  old_start_at timestamptz not null,
  old_end_at timestamptz not null,
  new_start_at timestamptz not null,
  new_end_at timestamptz not null,
  reason text,
  admin_override boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.booking_reschedules is
  'Append-only reschedule audit trail (spec section 21). One row per successful reschedule -- never overwritten. actor_type is customer or admin only: an expert can REQUEST a reschedule (booking_change_requests) but never directly executes one (spec section 26).';
create index booking_reschedules_booking_id_idx on public.booking_reschedules (booking_id);
alter table public.booking_reschedules enable row level security;
create policy booking_reschedules_select_own on public.booking_reschedules
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_reschedules.booking_id
        and (
          b.customer_id = auth.uid()
          or b.expert_profile_id in (select id from public.expert_profiles where user_id = auth.uid())
        )
    )
  );
create table public.booking_cancellations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cancelled_by_user_id uuid not null references public.profiles (id),
  actor_type text not null check (actor_type in ('customer', 'expert', 'admin')),
  reason text not null,
  details text,
  policy_cutoff_met boolean not null,
  financial_followup_required boolean not null default false,
  cancelled_at timestamptz not null default now()
);
comment on table public.booking_cancellations is
  'Append-only cancellation audit trail (spec section 39). financial_followup_required is an objective "this paid cancelled booking needs financial resolution" flag for Phase 11 -- never a refund amount, approval, or execution (spec sections 40-41, 88-90). No refund is ever calculated or applied here.';
create index booking_cancellations_booking_id_idx on public.booking_cancellations (booking_id);
alter table public.booking_cancellations enable row level security;
create policy booking_cancellations_select_own on public.booking_cancellations
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_cancellations.booking_id
        and (
          b.customer_id = auth.uid()
          or b.expert_profile_id in (select id from public.expert_profiles where user_id = auth.uid())
        )
    )
  );
create table public.booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  requester_type text not null check (requester_type in ('expert')),
  reason text not null,
  proposed_start_at timestamptz,
  proposed_end_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
comment on table public.booking_change_requests is
  'Expert reschedule REQUEST (spec sections 27-32) -- never a direct time change. status flips to accepted automatically when the customer''s own reschedule_booking() call succeeds while a pending request exists for that booking, or to declined via decline_expert_reschedule_request(). requester_type is expert-only in V1 -- customers reschedule directly via reschedule_booking(), they never need to "request" against their own booking.';
create index booking_change_requests_booking_id_idx on public.booking_change_requests (booking_id);
create unique index booking_change_requests_one_pending_per_booking
  on public.booking_change_requests (booking_id)
  where status = 'pending';
alter table public.booking_change_requests enable row level security;
create policy booking_change_requests_select_own on public.booking_change_requests
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_change_requests.booking_id
        and (
          b.customer_id = auth.uid()
          or b.expert_profile_id in (select id from public.expert_profiles where user_id = auth.uid())
        )
    )
  );
alter table public.integration_jobs drop constraint integration_jobs_job_type_check;
alter table public.integration_jobs add constraint integration_jobs_job_type_check check (job_type in (
  'booking_confirmation_email_customer',
  'booking_confirmation_email_expert',
  'calendar_create',
  'session_reminder_customer',
  'session_reminder_expert',
  'payment_rejected_email',
  'calendar_update',
  'calendar_cancel',
  'reschedule_email_customer',
  'reschedule_email_expert',
  'cancellation_email_customer',
  'cancellation_email_expert',
  'reschedule_request_email_customer'
));
drop function if exists public.get_booking_notification_context(uuid);
create function public.get_booking_notification_context(p_booking_id uuid)
returns table (
  booking_reference text,
  booking_status text,
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes int,
  session_format text,
  customer_id uuid,
  customer_email text,
  customer_full_name text,
  customer_timezone text,
  expert_user_id uuid,
  expert_email text,
  expert_full_name text,
  expert_timezone text,
  discussion_topic text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    b.booking_reference,
    b.booking_status,
    b.start_at,
    b.end_at,
    b.duration_minutes,
    b.session_format,
    b.customer_id,
    cu.email,
    cp.full_name,
    b.customer_timezone,
    ep.user_id,
    eu.email,
    epr.full_name,
    b.expert_timezone,
    bi.discussion_topic
  from public.bookings b
  join public.profiles cp on cp.id = b.customer_id
  join auth.users cu on cu.id = b.customer_id
  join public.expert_profiles ep on ep.id = b.expert_profile_id
  join public.profiles epr on epr.id = ep.user_id
  join auth.users eu on eu.id = ep.user_id
  left join public.booking_intake bi on bi.booking_id = b.id
  where b.id = p_booking_id;
$$;
comment on function public.get_booking_notification_context(uuid) is
  'service_role ONLY. Phase 10 adds booking_status to the projection so reminder handlers can refuse to send for a since-cancelled booking (spec section 62) without a second RPC. Otherwise identical to the Phase 9 (044) version.';
revoke execute on function public.get_booking_notification_context(uuid) from public, anon, authenticated;
grant execute on function public.get_booking_notification_context(uuid) to service_role;
drop function if exists public.get_bookable_slots(text, integer, text, date, date, text);
create function public.get_bookable_slots(
  p_expert_slug text,
  p_duration_minutes integer,
  p_session_format text,
  p_range_start date,
  p_range_end date,
  p_customer_timezone text default null,
  p_exclude_booking_id uuid default null
)
returns table (start_at timestamp with time zone, end_at timestamp with time zone, expert_timezone text)
language plpgsql
stable security definer
set search_path = public, pg_catalog
as $$
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
  select ep.id, s.timezone
    into v_expert_profile_id, v_timezone
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
    v_date := v_date + 1;
  end loop;
end;
$$;
comment on function public.get_bookable_slots(text, integer, text, date, date, text, uuid) is
  'Same slot engine as Phase 5 (034), now with an optional p_exclude_booking_id (spec section 15) so a booking being rescheduled does not block its own candidate slots out of its own search, while every other booking still blocks time exactly as before. Existing callers omitting the parameter are unaffected.';
grant execute on function public.get_bookable_slots(text, integer, text, date, date, text, uuid) to anon, authenticated;
create or replace function public.register_booking_reschedule_jobs(p_booking_id uuid, p_reschedule_id uuid)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_booking public.bookings%rowtype;
  v_offset int;
  v_fire_at timestamptz;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return;
  end if;
  insert into public.integration_jobs (booking_id, job_type, dedupe_key, scheduled_for)
  values
    (p_booking_id, 'calendar_update', 'calendar_update:' || p_reschedule_id, now()),
    (p_booking_id, 'reschedule_email_customer', 'reschedule_email_customer:' || p_reschedule_id, now()),
    (p_booking_id, 'reschedule_email_expert', 'reschedule_email_expert:' || p_reschedule_id, now())
  on conflict (dedupe_key) do nothing;
  foreach v_offset in array public.session_reminder_offsets_minutes()
  loop
    v_fire_at := v_booking.start_at - make_interval(mins => v_offset);
    if v_fire_at > now() then
      insert into public.integration_jobs (booking_id, job_type, payload, dedupe_key, scheduled_for, status, attempt_count, completed_at, last_error)
      values
        (p_booking_id, 'session_reminder_customer', jsonb_build_object('offset_minutes', v_offset),
         'reminder_customer_' || v_offset || ':' || p_booking_id, v_fire_at, 'pending', 0, null, null),
        (p_booking_id, 'session_reminder_expert', jsonb_build_object('offset_minutes', v_offset),
         'reminder_expert_' || v_offset || ':' || p_booking_id, v_fire_at, 'pending', 0, null, null)
      on conflict (dedupe_key) do update set
        status = 'pending',
        scheduled_for = excluded.scheduled_for,
        attempt_count = 0,
        completed_at = null,
        last_error = null,
        last_attempt_at = null;
    else
      delete from public.integration_jobs
        where dedupe_key in (
          'reminder_customer_' || v_offset || ':' || p_booking_id,
          'reminder_expert_' || v_offset || ':' || p_booking_id
        )
        and status <> 'completed';
    end if;
  end loop;
end;
$$;
comment on function public.register_booking_reschedule_jobs(uuid, uuid) is
  'Internal only. Registers Phase 10 reschedule side-effect jobs (calendar_update, both reschedule emails) and rebuilds session_reminder_* jobs against the booking''s NEW start_at, deleting any reminder whose new fire time has already passed. Called from inside reschedule_booking()/admin_reschedule_booking() in the same transaction as the start_at/end_at update.';
revoke execute on function public.register_booking_reschedule_jobs(uuid, uuid) from public, anon, authenticated;
create or replace function public.register_booking_cancellation_jobs(p_booking_id uuid, p_cancellation_id uuid)
returns void
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  insert into public.integration_jobs (booking_id, job_type, dedupe_key, scheduled_for)
  values
    (p_booking_id, 'calendar_cancel', 'calendar_cancel:' || p_cancellation_id, now()),
    (p_booking_id, 'cancellation_email_customer', 'cancellation_email_customer:' || p_cancellation_id, now()),
    (p_booking_id, 'cancellation_email_expert', 'cancellation_email_expert:' || p_cancellation_id, now())
  on conflict (dedupe_key) do nothing;
  delete from public.integration_jobs
    where booking_id = p_booking_id
      and job_type in ('session_reminder_customer', 'session_reminder_expert')
      and status = 'pending';
end;
$$;
comment on function public.register_booking_cancellation_jobs(uuid, uuid) is
  'Internal only. Registers Phase 10 cancellation side-effect jobs (calendar_cancel, both cancellation emails) and deletes any still-pending reminder jobs for this booking (spec section 62). Called from inside cancel_customer_booking()/cancel_expert_booking()/admin_cancel_booking() in the same transaction as the booking_status update.';
revoke execute on function public.register_booking_cancellation_jobs(uuid, uuid) from public, anon, authenticated;
create or replace function public.reschedule_booking(
  p_booking_reference text,
  p_new_start_at timestamptz,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
  v_new_end_at timestamptz;
  v_local_date date;
  v_local_start time;
  v_local_end time;
  v_reschedule_id uuid;
  v_reason text;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  if p_new_start_at is null then
    raise exception 'A new start time is required.' using errcode = '22023';
  end if;
  select * into v_booking from public.bookings where booking_reference = p_booking_reference and customer_id = v_customer_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status <> 'confirmed' then
    raise exception 'This session cannot be rescheduled right now.' using errcode = '23514';
  end if;
  if v_booking.start_at <= now() then
    raise exception 'This session has already started or passed.' using errcode = '23514';
  end if;
  if v_booking.start_at < now() + make_interval(hours => public.customer_reschedule_cutoff_hours()) then
    raise exception 'This session is within the 24-hour change window. Contact Pivotroom for help.' using errcode = '23514';
  end if;
  v_new_end_at := p_new_start_at + make_interval(mins => v_booking.duration_minutes);
  if p_new_start_at < now() + make_interval(hours => public.booking_min_notice_hours()) then
    raise exception 'That time no longer meets the minimum booking notice.' using errcode = '23514';
  end if;
  if p_new_start_at > now() + make_interval(days => public.booking_horizon_days()) then
    raise exception 'That time is too far in the future to book yet.' using errcode = '23514';
  end if;
  v_local_date := (p_new_start_at at time zone v_booking.expert_timezone)::date;
  v_local_start := (p_new_start_at at time zone v_booking.expert_timezone)::time;
  v_local_end := (v_new_end_at at time zone v_booking.expert_timezone)::time;
  if v_local_end <= v_local_start then
    raise exception 'That time is no longer available.' using errcode = '23514';
  end if;
  if not public.expert_window_is_available(v_booking.expert_profile_id, v_local_date, v_local_start, v_local_end) then
    raise exception 'That time is no longer available.' using errcode = '23514';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  begin
    update public.bookings
      set start_at = p_new_start_at,
          end_at = v_new_end_at
      where id = v_booking.id;
  exception
    when exclusion_violation then
      raise exception 'That time was just taken. Please choose another available time.' using errcode = '23P01';
  end;
  insert into public.booking_reschedules (booking_id, initiated_by_user_id, actor_type, old_start_at, old_end_at, new_start_at, new_end_at, reason)
  values (v_booking.id, v_customer_id, 'customer', v_booking.start_at, v_booking.end_at, p_new_start_at, v_new_end_at, v_reason)
  returning id into v_reschedule_id;
  update public.booking_change_requests
    set status = 'accepted', responded_at = now()
    where booking_id = v_booking.id and status = 'pending';
  perform public.register_booking_reschedule_jobs(v_booking.id, v_reschedule_id);
end;
$$;
comment on function public.reschedule_booking(text, timestamptz, text) is
  'Customer-only. Moves an existing CONFIRMED booking to a new start_at, atomically, outside the 24h cutoff. Same expert/duration/format/price always -- none are parameters. Re-validates the new slot via the same Phase 4 engine as original booking; the bookings exclusion constraints (033) provide the actual concurrency guarantee on the UPDATE itself. A failed reschedule (cutoff, invalid slot, or a concurrently-taken slot) leaves the original booking completely unchanged.';
revoke execute on function public.reschedule_booking(text, timestamptz, text) from public, anon;
grant execute on function public.reschedule_booking(text, timestamptz, text) to authenticated;
create or replace function public.admin_reschedule_booking(
  p_booking_reference text,
  p_new_start_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_booking public.bookings%rowtype;
  v_new_end_at timestamptz;
  v_local_date date;
  v_local_start time;
  v_local_end time;
  v_reschedule_id uuid;
  v_reason text;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;
  if p_new_start_at is null then
    raise exception 'A new start time is required.' using errcode = '22023';
  end if;
  select * into v_booking from public.bookings where booking_reference = p_booking_reference for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status <> 'confirmed' then
    raise exception 'This session cannot be rescheduled right now.' using errcode = '23514';
  end if;
  v_new_end_at := p_new_start_at + make_interval(mins => v_booking.duration_minutes);
  v_local_date := (p_new_start_at at time zone v_booking.expert_timezone)::date;
  v_local_start := (p_new_start_at at time zone v_booking.expert_timezone)::time;
  v_local_end := (v_new_end_at at time zone v_booking.expert_timezone)::time;
  if v_local_end <= v_local_start then
    raise exception 'That time is not valid.' using errcode = '23514';
  end if;
  if not public.expert_window_is_available(v_booking.expert_profile_id, v_local_date, v_local_start, v_local_end) then
    raise exception 'That time is not available.' using errcode = '23514';
  end if;
  begin
    update public.bookings
      set start_at = p_new_start_at,
          end_at = v_new_end_at
      where id = v_booking.id;
  exception
    when exclusion_violation then
      raise exception 'That time was just taken. Please choose another available time.' using errcode = '23P01';
  end;
  insert into public.booking_reschedules (booking_id, initiated_by_user_id, actor_type, old_start_at, old_end_at, new_start_at, new_end_at, reason, admin_override)
  values (v_booking.id, v_admin_id, 'admin', v_booking.start_at, v_booking.end_at, p_new_start_at, v_new_end_at, v_reason, true)
  returning id into v_reschedule_id;
  update public.booking_change_requests
    set status = 'accepted', responded_at = now()
    where booking_id = v_booking.id and status = 'pending';
  perform public.register_booking_reschedule_jobs(v_booking.id, v_reschedule_id);
end;
$$;
comment on function public.admin_reschedule_booking(text, timestamptz, text) is
  'Admin-only. Same atomic reschedule as reschedule_booking(), bypassing the 24h customer cutoff, with a required reason and admin_override=true recorded on the history row. Still cannot bypass the exclusion-constraint double-booking protection.';
revoke execute on function public.admin_reschedule_booking(text, timestamptz, text) from public, anon;
grant execute on function public.admin_reschedule_booking(text, timestamptz, text) to authenticated;
create or replace function public.cancel_customer_booking(
  p_booking_reference text,
  p_reason text,
  p_details text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
  v_reason text;
  v_cutoff_met boolean;
  v_financial_followup boolean;
  v_cancellation_id uuid;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Please select a reason for cancelling.' using errcode = '22023';
  end if;
  select * into v_booking from public.bookings where booking_reference = p_booking_reference and customer_id = v_customer_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status <> 'confirmed' then
    raise exception 'This session cannot be cancelled right now.' using errcode = '23514';
  end if;
  if v_booking.start_at <= now() then
    raise exception 'This session has already started or passed.' using errcode = '23514';
  end if;
  v_cutoff_met := v_booking.start_at >= now() + make_interval(hours => public.customer_cancel_cutoff_hours());
  if not v_cutoff_met then
    raise exception 'This session is within the 24-hour change window. Contact Pivotroom for help.' using errcode = '23514';
  end if;
  v_financial_followup := exists (
    select 1 from public.payments where booking_id = v_booking.id and payment_status = 'verified'
  );
  update public.bookings set booking_status = 'cancelled' where id = v_booking.id;
  insert into public.booking_cancellations (booking_id, cancelled_by_user_id, actor_type, reason, details, policy_cutoff_met, financial_followup_required)
  values (v_booking.id, v_customer_id, 'customer', v_reason, nullif(trim(coalesce(p_details, '')), ''), v_cutoff_met, v_financial_followup)
  returning id into v_cancellation_id;
  perform public.register_booking_cancellation_jobs(v_booking.id, v_cancellation_id);
end;
$$;
comment on function public.cancel_customer_booking(text, text, text) is
  'Customer-only. Atomically cancels a CONFIRMED booking outside the 24h cutoff: booking_status -> cancelled, cancellation history row, side-effect jobs registered, pending reminders deleted. Never touches payment_status -- a verified payment stays verified; financial_followup_required is set for Phase 11 to act on later, never a refund calculated here (spec sections 87, 41).';
revoke execute on function public.cancel_customer_booking(text, text, text) from public, anon;
grant execute on function public.cancel_customer_booking(text, text, text) to authenticated;
create or replace function public.cancel_expert_booking(
  p_booking_reference text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_expert_user_id uuid;
  v_expert_profile_id uuid;
  v_booking public.bookings%rowtype;
  v_reason text;
  v_cutoff_met boolean;
  v_financial_followup boolean;
  v_cancellation_id uuid;
begin
  v_expert_user_id := auth.uid();
  if v_expert_user_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select id into v_expert_profile_id from public.expert_profiles where user_id = v_expert_user_id;
  if v_expert_profile_id is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Please explain why you are cancelling.' using errcode = '22023';
  end if;
  select * into v_booking from public.bookings where booking_reference = p_booking_reference and expert_profile_id = v_expert_profile_id for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status <> 'confirmed' then
    raise exception 'This session cannot be cancelled right now.' using errcode = '23514';
  end if;
  if v_booking.start_at <= now() then
    raise exception 'This session has already started or passed.' using errcode = '23514';
  end if;
  v_cutoff_met := v_booking.start_at >= now() + make_interval(hours => public.customer_cancel_cutoff_hours());
  v_financial_followup := exists (
    select 1 from public.payments where booking_id = v_booking.id and payment_status = 'verified'
  );
  update public.bookings set booking_status = 'cancelled' where id = v_booking.id;
  insert into public.booking_cancellations (booking_id, cancelled_by_user_id, actor_type, reason, policy_cutoff_met, financial_followup_required)
  values (v_booking.id, v_expert_user_id, 'expert', v_reason, v_cutoff_met, v_financial_followup)
  returning id into v_cancellation_id;
  perform public.register_booking_cancellation_jobs(v_booking.id, v_cancellation_id);
end;
$$;
comment on function public.cancel_expert_booking(text, text) is
  'Expert-only, own bookings only (expert_profile_id resolved from auth.uid(), never trusted from the client). May cancel inside the customer''s 24h cutoff -- the expert genuinely cannot provide the session -- but policy_cutoff_met is still recorded as a fact. Reason mandatory. Same atomic cancel/history/side-effect pattern as cancel_customer_booking().';
revoke execute on function public.cancel_expert_booking(text, text) from public, anon;
grant execute on function public.cancel_expert_booking(text, text) to authenticated;
create or replace function public.admin_cancel_booking(
  p_booking_reference text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_admin_id uuid;
  v_booking public.bookings%rowtype;
  v_reason text;
  v_cutoff_met boolean;
  v_financial_followup boolean;
  v_cancellation_id uuid;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;
  select * into v_booking from public.bookings where booking_reference = p_booking_reference for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status <> 'confirmed' then
    raise exception 'This session cannot be cancelled right now.' using errcode = '23514';
  end if;
  v_cutoff_met := v_booking.start_at >= now() + make_interval(hours => public.customer_cancel_cutoff_hours());
  v_financial_followup := exists (
    select 1 from public.payments where booking_id = v_booking.id and payment_status = 'verified'
  );
  update public.bookings set booking_status = 'cancelled' where id = v_booking.id;
  insert into public.booking_cancellations (booking_id, cancelled_by_user_id, actor_type, reason, policy_cutoff_met, financial_followup_required)
  values (v_booking.id, v_admin_id, 'admin', v_reason, v_cutoff_met, v_financial_followup)
  returning id into v_cancellation_id;
  perform public.register_booking_cancellation_jobs(v_booking.id, v_cancellation_id);
end;
$$;
comment on function public.admin_cancel_booking(text, text) is
  'Admin-only. Same atomic cancel/history/side-effect pattern as cancel_customer_booking(), no cutoff restriction, required reason. Never touches payment_status; never calculates a refund.';
revoke execute on function public.admin_cancel_booking(text, text) from public, anon;
grant execute on function public.admin_cancel_booking(text, text) to authenticated;
create or replace function public.request_expert_reschedule(
  p_booking_reference text,
  p_reason text,
  p_proposed_start_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_expert_user_id uuid;
  v_expert_profile_id uuid;
  v_booking public.bookings%rowtype;
  v_reason text;
  v_proposed_end_at timestamptz;
begin
  v_expert_user_id := auth.uid();
  if v_expert_user_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select id into v_expert_profile_id from public.expert_profiles where user_id = v_expert_user_id;
  if v_expert_profile_id is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Please explain why you are requesting a change.' using errcode = '22023';
  end if;
  select * into v_booking from public.bookings where booking_reference = p_booking_reference and expert_profile_id = v_expert_profile_id;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status <> 'confirmed' then
    raise exception 'This session cannot be changed right now.' using errcode = '23514';
  end if;
  if v_booking.start_at <= now() then
    raise exception 'This session has already started or passed.' using errcode = '23514';
  end if;
  if p_proposed_start_at is not null then
    v_proposed_end_at := p_proposed_start_at + make_interval(mins => v_booking.duration_minutes);
  end if;
  begin
    insert into public.booking_change_requests (booking_id, requested_by, requester_type, reason, proposed_start_at, proposed_end_at)
    values (v_booking.id, v_expert_user_id, 'expert', v_reason, p_proposed_start_at, v_proposed_end_at);
  exception
    when unique_violation then
      raise exception 'There is already a pending change request for this session.' using errcode = '23505';
  end;
  insert into public.integration_jobs (booking_id, job_type, dedupe_key, scheduled_for)
  values (v_booking.id, 'reschedule_request_email_customer', 'reschedule_request_email:' || gen_random_uuid(), now());
end;
$$;
comment on function public.request_expert_reschedule(text, text, timestamptz) is
  'Expert-only, own bookings only. Creates a pending booking_change_requests row and notifies the customer -- never changes bookings.start_at/end_at directly (spec section 29). At most one pending request per booking (booking_change_requests_one_pending_per_booking).';
revoke execute on function public.request_expert_reschedule(text, text, timestamptz) from public, anon;
grant execute on function public.request_expert_reschedule(text, text, timestamptz) to authenticated;
create or replace function public.decline_expert_reschedule_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_booking_id uuid;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select r.booking_id into v_booking_id
  from public.booking_change_requests r
  join public.bookings b on b.id = r.booking_id
  where r.id = p_request_id and r.status = 'pending' and b.customer_id = v_customer_id
  for update of r;
  if v_booking_id is null then
    raise exception 'Request not found.' using errcode = '42501';
  end if;
  update public.booking_change_requests
    set status = 'declined', responded_at = now()
    where id = p_request_id;
end;
$$;
comment on function public.decline_expert_reschedule_request(uuid) is
  'Customer-only, own booking only. Declines a pending expert reschedule request without changing the booking at all (spec section 32) -- the original session stays exactly as it was.';
revoke execute on function public.decline_expert_reschedule_request(uuid) from public, anon;
grant execute on function public.decline_expert_reschedule_request(uuid) to authenticated;

-- ===== 046_v2_index_and_rls_performance.sql
create index if not exists booking_cancellations_cancelled_by_user_id_idx
  on public.booking_cancellations (cancelled_by_user_id);
create index if not exists booking_change_requests_requested_by_idx
  on public.booking_change_requests (requested_by);
create index if not exists booking_reschedules_initiated_by_user_id_idx
  on public.booking_reschedules (initiated_by_user_id);
create index if not exists bookings_session_type_id_idx
  on public.bookings (session_type_id);
create index if not exists expert_profiles_approved_by_idx
  on public.expert_profiles (approved_by);
create index if not exists expert_profiles_published_by_idx
  on public.expert_profiles (published_by);
create index if not exists expert_profiles_reviewed_by_idx
  on public.expert_profiles (reviewed_by);
create index if not exists integration_jobs_payment_id_idx
  on public.integration_jobs (payment_id);
create index if not exists payments_verified_by_idx
  on public.payments (verified_by);
alter policy booking_reschedules_select_own on public.booking_reschedules
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.bookings b
      where b.id = booking_reschedules.booking_id
        and (
          b.customer_id = (select auth.uid())
          or b.expert_profile_id in (
            select ep.id from public.expert_profiles ep where ep.user_id = (select auth.uid())
          )
        )
    )
  );
alter policy booking_cancellations_select_own on public.booking_cancellations
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.bookings b
      where b.id = booking_cancellations.booking_id
        and (
          b.customer_id = (select auth.uid())
          or b.expert_profile_id in (
            select ep.id from public.expert_profiles ep where ep.user_id = (select auth.uid())
          )
        )
    )
  );
alter policy booking_change_requests_select_own on public.booking_change_requests
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.bookings b
      where b.id = booking_change_requests.booking_id
        and (
          b.customer_id = (select auth.uid())
          or b.expert_profile_id in (
            select ep.id from public.expert_profiles ep where ep.user_id = (select auth.uid())
          )
        )
    )
  );

-- ===== 047a_public_expert_categories.sql
alter policy expert_categories_select_active on public.expert_categories to anon, authenticated;
grant select on public.expert_categories to anon;

-- ===== 047b_platform_settings.sql
create table if not exists public.platform_settings (
  id boolean primary key default true check (id),  -- singleton
  vat_rate numeric(5, 4) not null default 0.15 check (vat_rate >= 0 and vat_rate < 1),
  commission_rate numeric(5, 4) not null default 0.20 check (commission_rate >= 0 and commission_rate < 1),
  manual_verification_threshold numeric(12, 2) not null default 300000 check (manual_verification_threshold > 0),
  currency text not null default 'ETB',
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_settings enable row level security;
create policy platform_settings_select_all on public.platform_settings
  for select to anon, authenticated using (true);
grant select on public.platform_settings to anon, authenticated;
comment on table public.platform_settings is
  'Single-row platform pricing configuration (VAT, commission, manual-verification threshold). Snapshotted onto each booking at creation.';

-- ===== 047c_booking_price_breakdown.sql
alter table public.bookings
  add column if not exists vat_rate numeric(5, 4),
  add column if not exists vat_amount numeric(12, 2),
  add column if not exists total_price numeric(12, 2),
  add column if not exists commission_rate numeric(5, 4),
  add column if not exists commission_amount numeric(12, 2),
  add column if not exists expert_payout_amount numeric(12, 2);
alter table public.bookings add constraint bookings_price_breakdown_consistent check (
  total_price is null
  or (
    vat_amount is not null and commission_amount is not null and expert_payout_amount is not null
    and total_price = base_price + vat_amount
    and expert_payout_amount = base_price - commission_amount
  )
);
comment on column public.bookings.base_price is 'Expert''s price for the session (VAT-exclusive). Pivotroom commission is included in it.';
comment on column public.bookings.total_price is 'Amount the customer pays: base_price + vat_amount. NULL only on bookings created before migration 047 (those were charged base_price).';
comment on column public.bookings.commission_amount is 'Pivotroom commission, commission_rate x base_price.';
comment on column public.bookings.expert_payout_amount is 'base_price - commission_amount.';
create or replace function public.bookings_set_price_breakdown()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_settings public.platform_settings%rowtype;
begin
  select * into v_settings from public.platform_settings where id;
  new.vat_rate := v_settings.vat_rate;
  new.vat_amount := round(new.base_price * v_settings.vat_rate, 2);
  new.total_price := new.base_price + new.vat_amount;
  new.commission_rate := v_settings.commission_rate;
  new.commission_amount := round(new.base_price * v_settings.commission_rate, 2);
  new.expert_payout_amount := new.base_price - new.commission_amount;
  return new;
end;
$$;
create or replace trigger bookings_set_price_breakdown
  before insert on public.bookings
  for each row execute function public.bookings_set_price_breakdown();
create or replace function public.bookings_lock_price_breakdown()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.base_price := old.base_price;
  new.vat_rate := old.vat_rate;
  new.vat_amount := old.vat_amount;
  new.total_price := old.total_price;
  new.commission_rate := old.commission_rate;
  new.commission_amount := old.commission_amount;
  new.expert_payout_amount := old.expert_payout_amount;
  return new;
end;
$$;
create or replace trigger bookings_lock_price_breakdown
  before update on public.bookings
  for each row execute function public.bookings_lock_price_breakdown();
revoke execute on function public.bookings_set_price_breakdown() from public, anon, authenticated;
revoke execute on function public.bookings_lock_price_breakdown() from public, anon, authenticated;

-- ===== 047d_charge_vat_inclusive_total.sql
create or replace function public.create_chapa_payment_attempt(p_booking_reference text, p_provider_mode text default null::text)
returns table(payment_id uuid, provider_tx_ref text, expected_amount numeric, currency text)
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
  v_existing public.payments%rowtype;
  v_tx_ref text;
  v_payment_id uuid;
  v_amount numeric(12, 2);
  v_threshold numeric(12, 2);
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select * into v_booking
  from public.bookings
  where booking_reference = p_booking_reference and customer_id = v_customer_id
  for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status in ('held', 'awaiting_payment')
    and v_booking.hold_expires_at is not null
    and v_booking.hold_expires_at <= now()
  then
    update public.bookings set booking_status = 'expired' where id = v_booking.id;
    raise exception 'Your reserved time expired. Please choose another available time.' using errcode = '23514';
  end if;
  if v_booking.booking_status = 'held' then
    raise exception 'Please complete your booking details first.' using errcode = '23514';
  end if;
  if v_booking.booking_status <> 'awaiting_payment' then
    raise exception 'This booking is no longer awaiting payment.' using errcode = '23514';
  end if;
  v_amount := coalesce(v_booking.total_price, v_booking.base_price);
  select manual_verification_threshold into v_threshold from public.platform_settings where id;
  if v_threshold is not null and v_amount > v_threshold then
    raise exception 'Payments above % % are verified manually. Please pay by bank transfer.',
      to_char(v_threshold, 'FM999,999,999'), v_booking.currency
      using errcode = '23514';
  end if;
  select * into v_existing
  from public.payments
  where booking_id = v_booking.id and payment_method = 'chapa' and payment_status = 'initiated'
  limit 1;
  if v_existing.id is not null then
    payment_id := v_existing.id;
    provider_tx_ref := v_existing.provider_tx_ref;
    expected_amount := v_existing.expected_amount;
    currency := v_existing.currency;
    return next;
    return;
  end if;
  v_tx_ref := public.generate_chapa_tx_ref();
  begin
    insert into public.payments (
      booking_id, customer_id, payment_method,
      expected_amount, amount_paid, currency,
      payment_status, provider_tx_ref, provider_mode, initialized_at
    ) values (
      v_booking.id, v_customer_id, 'chapa',
      v_amount, v_amount, v_booking.currency,
      'initiated', v_tx_ref, p_provider_mode, now()
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      select id into v_payment_id
      from public.payments
      where booking_id = v_booking.id and payment_method = 'chapa' and payment_status = 'initiated'
      order by created_at desc
      limit 1;
  end;
  update public.bookings
    set hold_expires_at = now() + make_interval(mins => public.chapa_checkout_hold_minutes())
    where id = v_booking.id;
  payment_id := v_payment_id;
  provider_tx_ref := v_tx_ref;
  expected_amount := v_amount;
  currency := v_booking.currency;
  return next;
end;
$function$;
create or replace function public.submit_manual_payment(p_booking_reference text, p_bank_used text, p_transaction_reference text, p_amount_paid numeric, p_receipt_path text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
  v_bank_used text;
  v_transaction_reference text;
  v_payment_id uuid;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'You must be logged in to do that.' using errcode = '42501';
  end if;
  select * into v_booking
  from public.bookings
  where booking_reference = p_booking_reference
    and customer_id = v_customer_id
  for update;
  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;
  if v_booking.booking_status in ('held', 'awaiting_payment')
    and v_booking.hold_expires_at is not null
    and v_booking.hold_expires_at <= now()
  then
    update public.bookings set booking_status = 'expired' where id = v_booking.id;
    raise exception 'Your reserved time expired. Please choose another available time.' using errcode = '23514';
  end if;
  if v_booking.booking_status = 'held' then
    raise exception 'Please complete your booking details first.' using errcode = '23514';
  end if;
  if v_booking.booking_status <> 'awaiting_payment' then
    raise exception 'This booking is no longer awaiting payment.' using errcode = '23514';
  end if;
  v_bank_used := trim(p_bank_used);
  if v_bank_used = '' or char_length(v_bank_used) > 150 then
    raise exception 'Please enter the bank you transferred from.' using errcode = '22023';
  end if;
  v_transaction_reference := trim(p_transaction_reference);
  if v_transaction_reference = '' or char_length(v_transaction_reference) > 200 then
    raise exception 'Please enter your transaction or reference ID.' using errcode = '22023';
  end if;
  if p_amount_paid is null or p_amount_paid <= 0 then
    raise exception 'Please enter the amount you paid.' using errcode = '22023';
  end if;
  begin
    insert into public.payments (
      booking_id, customer_id, payment_method,
      expected_amount, amount_paid, currency,
      bank_used, transaction_reference, receipt_path,
      payment_status
    ) values (
      v_booking.id, v_customer_id, 'manual',
      coalesce(v_booking.total_price, v_booking.base_price), p_amount_paid, v_booking.currency,
      v_bank_used, v_transaction_reference, p_receipt_path,
      'pending_verification'
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      select id into v_payment_id
      from public.payments
      where booking_id = v_booking.id and payment_status = 'pending_verification'
      order by submitted_at desc
      limit 1;
  end;
  update public.bookings
    set hold_expires_at = now() + make_interval(hours => public.manual_payment_verification_hold_hours())
    where id = v_booking.id;
  return v_payment_id;
end;
$function$;

-- ===== 048_v2_ai_matching.sql
create or replace function public.get_expert_match_candidates_public()
returns table (
  slug text,
  full_name text,
  headline text,
  current_position text,
  current_company text,
  category_names text[],
  expertise_summary text,
  problems_help_with text,
  who_i_help text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    ep.slug,
    p.full_name,
    left(ep.headline, 160),
    left(ep.current_position, 80),
    left(ep.current_company, 80),
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    left(ep.expertise_summary, 400),
    left(ep.problems_help_with, 400),
    left(ep.who_i_help, 240)
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  where ep.profile_status = 'published'
  order by p.full_name;
$function$;
revoke execute on function public.get_expert_match_candidates_public() from public;
grant execute on function public.get_expert_match_candidates_public() to anon, authenticated;
create table if not exists public.ai_match_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  client_key_hash text not null,
  outcome text not null check (outcome in ('ai', 'fallback_no_key', 'fallback_error', 'rate_limited')),
  model text,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  match_count integer not null default 0 check (match_count >= 0),
  prompt_tokens integer check (prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens >= 0),
  estimated_cost_usd numeric(10, 6) check (estimated_cost_usd >= 0)
);
create index if not exists ai_match_requests_client_created_idx
  on public.ai_match_requests (client_key_hash, created_at desc);
create index if not exists ai_match_requests_created_idx
  on public.ai_match_requests (created_at desc);
create index if not exists ai_match_requests_user_id_idx
  on public.ai_match_requests (user_id);
alter table public.ai_match_requests enable row level security;
revoke all on public.ai_match_requests from anon, authenticated;
comment on table public.ai_match_requests is
  'AI matching usage log (V2). No problem text or model output is stored. Server-only (service role).';

-- ===== 049a_expert_profile_details.sql
alter table public.expert_profiles
  add column if not exists languages text[] not null default '{}',
  add column if not exists response_time text,
  add column if not exists experience jsonb not null default '[]'::jsonb;
alter table public.expert_profiles
  add constraint expert_profiles_languages_count check (cardinality(languages) <= 8);
alter table public.expert_profiles
  add constraint expert_profiles_response_time_valid
    check (response_time is null or response_time in ('few_hours', 'one_day', 'two_days'));
alter table public.expert_profiles
  add constraint expert_profiles_experience_shape
    check (jsonb_typeof(experience) = 'array' and jsonb_array_length(experience) <= 12);
comment on column public.expert_profiles.languages is 'Session languages, e.g. {Amharic,English}. Max 8.';
comment on column public.expert_profiles.response_time is 'Expert''s stated reply commitment: few_hours | one_day | two_days.';
comment on column public.expert_profiles.experience is
  'Dated experience timeline: [{"start_year":2016,"end_year":null,"title":"...","organization":"..."}]. Max 12 entries; validated by the app.';
grant insert (languages, response_time, experience) on public.expert_profiles to authenticated;
grant update (languages, response_time, experience) on public.expert_profiles to authenticated;

-- ===== 049b_expert_reviews.sql
create table if not exists public.expert_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 10 and 1000),
  is_hidden boolean not null default false,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expert_reviews_expert_idx on public.expert_reviews (expert_profile_id, created_at desc);
create index if not exists expert_reviews_customer_idx on public.expert_reviews (customer_id);
create index if not exists expert_reviews_hidden_by_idx on public.expert_reviews (hidden_by);
alter table public.expert_reviews enable row level security;
create policy expert_reviews_select_own on public.expert_reviews
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or expert_profile_id in (select ep.id from public.expert_profiles ep where ep.user_id = (select auth.uid()))
    or (select public.is_admin())
  );
create policy expert_reviews_update_admin on public.expert_reviews
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
revoke all on public.expert_reviews from anon, authenticated;
grant select on public.expert_reviews to authenticated;
grant update (is_hidden, hidden_by, updated_at) on public.expert_reviews to authenticated;
comment on table public.expert_reviews is
  'One review per completed booking. Written only via submit_expert_review(); hidden by admins via is_hidden.';
create or replace function public.submit_expert_review(p_booking_reference text, p_rating integer, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to leave a review.' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where booking_reference = p_booking_reference;
  if not found or v_booking.customer_id <> v_uid then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_booking.booking_status not in ('confirmed', 'completed') or v_booking.end_at > now() then
    raise exception 'You can review a session once it has taken place.' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5.' using errcode = '22023';
  end if;
  if char_length(v_body) < 10 or char_length(v_body) > 1000 then
    raise exception 'Write between 10 and 1,000 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from public.expert_reviews where booking_id = v_booking.id) then
    raise exception 'You have already reviewed this session.' using errcode = '23505';
  end if;
  insert into public.expert_reviews (booking_id, expert_profile_id, customer_id, rating, body)
  values (v_booking.id, v_booking.expert_profile_id, v_uid, p_rating, v_body)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.submit_expert_review(text, integer, text) from public, anon;
grant execute on function public.submit_expert_review(text, integer, text) to authenticated;
create or replace function public.get_expert_reviews_public(p_slug text)
returns table (
  rating smallint,
  body text,
  reviewer_name text,
  duration_minutes integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.rating,
    r.body,
    case
      when p.full_name is null or btrim(p.full_name) = '' then 'Pivotroom client'
      when position(' ' in btrim(p.full_name)) = 0 then btrim(p.full_name)
      else split_part(btrim(p.full_name), ' ', 1) || ' '
        || upper(left(regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
    end,
    b.duration_minutes,
    r.created_at
  from public.expert_reviews r
  join public.expert_profiles ep on ep.id = r.expert_profile_id
  join public.bookings b on b.id = r.booking_id
  join public.profiles p on p.id = r.customer_id
  where ep.slug = p_slug and ep.profile_status = 'published' and not r.is_hidden
  order by r.created_at desc
  limit 24;
$$;
revoke execute on function public.get_expert_reviews_public(text) from public;
grant execute on function public.get_expert_reviews_public(text) to anon, authenticated;

-- ===== 049c_public_directory_v2.sql
create or replace function public.expert_public_stats(p_expert_profile_id uuid)
returns table (sessions_completed integer, review_count integer, rating_avg numeric, is_top_expert boolean)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select count(*)::integer as n
    from public.bookings b
    where b.expert_profile_id = p_expert_profile_id
      and b.booking_status in ('confirmed', 'completed')
      and b.end_at < now()
  ),
  r as (
    select count(*)::integer as n, round(avg(rating)::numeric, 2) as avg
    from public.expert_reviews
    where expert_profile_id = p_expert_profile_id and not is_hidden
  )
  select s.n, r.n, r.avg, (s.n >= 3 and r.n >= 2 and coalesce(r.avg, 0) >= 4.5)
  from s, r;
$$;
revoke execute on function public.expert_public_stats(uuid) from public, anon, authenticated;
create or replace function public.get_expert_directory_public_v2()
returns table (
  slug text,
  headline text,
  current_position text,
  current_company text,
  profile_image_path text,
  online_enabled boolean,
  in_person_enabled boolean,
  full_name text,
  category_names text[],
  starting_price numeric,
  starting_duration_minutes integer,
  languages text[],
  sessions_completed integer,
  review_count integer,
  rating_avg numeric,
  is_top_expert boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ep.slug,
    ep.headline,
    ep.current_position,
    ep.current_company,
    ep.profile_image_path,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    cheapest.base_price,
    cheapest.duration_minutes,
    ep.languages,
    st.sessions_completed,
    st.review_count,
    st.rating_avg,
    st.is_top_expert
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  cross join lateral public.expert_public_stats(ep.id) st
  left join lateral (
    select est.base_price, est.duration_minutes
    from public.expert_session_types est
    where est.expert_profile_id = ep.id and est.is_active = true
    order by est.base_price, est.duration_minutes
    limit 1
  ) cheapest on true
  where ep.profile_status = 'published'
  order by st.is_top_expert desc, st.sessions_completed desc, st.rating_avg desc nulls last,
    st.review_count desc, p.full_name;
$$;
revoke execute on function public.get_expert_directory_public_v2() from public;
grant execute on function public.get_expert_directory_public_v2() to anon, authenticated;
create or replace function public.get_expert_profile_public_v2(p_slug text)
returns table (
  slug text,
  headline text,
  current_position text,
  current_company text,
  years_experience_range text,
  short_bio text,
  expertise_summary text,
  problems_help_with text,
  who_i_help text,
  career_highlights text,
  linkedin_url text,
  country text,
  city text,
  profile_image_path text,
  online_enabled boolean,
  in_person_enabled boolean,
  full_name text,
  category_names text[],
  languages text[],
  response_time text,
  experience jsonb,
  sessions_completed integer,
  review_count integer,
  rating_avg numeric,
  is_top_expert boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ep.slug,
    ep.headline,
    ep.current_position,
    ep.current_company,
    ep.years_experience_range,
    ep.short_bio,
    ep.expertise_summary,
    ep.problems_help_with,
    ep.who_i_help,
    ep.career_highlights,
    ep.linkedin_url,
    ep.country,
    ep.city,
    ep.profile_image_path,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    ep.languages,
    ep.response_time,
    ep.experience,
    st.sessions_completed,
    st.review_count,
    st.rating_avg,
    st.is_top_expert
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  cross join lateral public.expert_public_stats(ep.id) st
  where ep.profile_status = 'published' and ep.slug = p_slug;
$$;
revoke execute on function public.get_expert_profile_public_v2(text) from public;
grant execute on function public.get_expert_profile_public_v2(text) to anon, authenticated;

-- ===== 050_expert_onboarding_and_visibility.sql
alter table public.expert_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists hidden_fields text[] not null default '{}';
alter table public.expert_profiles
  add constraint expert_profiles_hidden_fields_valid check (
    hidden_fields <@ array[
      'photo', 'current_position', 'current_company', 'years_experience', 'location', 'linkedin',
      'languages', 'response_time', 'short_bio', 'expertise_summary', 'problems_help_with',
      'who_i_help', 'career_highlights', 'experience', 'reviews', 'stats'
    ]::text[]
  );
comment on column public.expert_profiles.terms_accepted_at is 'When the expert accepted the expert terms (server time). Set once by the expert.';
comment on column public.expert_profiles.hidden_fields is
  'Profile details an admin chose not to show publicly. Admin-only; masked by every public read function.';
grant update (terms_accepted_at, hidden_fields) on public.expert_profiles to authenticated;
create or replace function public.protect_expert_profile_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if public.is_admin() then
    new.terms_accepted_at := old.terms_accepted_at;
  else
    new.hidden_fields := old.hidden_fields;
    if old.terms_accepted_at is not null then
      new.terms_accepted_at := old.terms_accepted_at;
    elsif new.terms_accepted_at is not null then
      new.terms_accepted_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_expert_profile_visibility() from public, anon, authenticated;
create or replace trigger protect_expert_profile_visibility
  before update on public.expert_profiles
  for each row execute function public.protect_expert_profile_visibility();
create policy expert_profile_categories_insert_admin on public.expert_profile_categories
  for insert to authenticated
  with check ((select public.is_admin()));
create policy expert_profile_categories_delete_admin on public.expert_profile_categories
  for delete to authenticated
  using ((select public.is_admin()));
revoke execute on function public.get_expert_profile_public(text) from anon, authenticated;
revoke execute on function public.get_expert_directory_public() from anon, authenticated;

-- ===== 050b_public_functions_respect_hidden_fields.sql
create or replace function public.get_expert_profile_public_v2(p_slug text)
returns table (
  slug text,
  headline text,
  current_position text,
  current_company text,
  years_experience_range text,
  short_bio text,
  expertise_summary text,
  problems_help_with text,
  who_i_help text,
  career_highlights text,
  linkedin_url text,
  country text,
  city text,
  profile_image_path text,
  online_enabled boolean,
  in_person_enabled boolean,
  full_name text,
  category_names text[],
  languages text[],
  response_time text,
  experience jsonb,
  sessions_completed integer,
  review_count integer,
  rating_avg numeric,
  is_top_expert boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ep.slug,
    ep.headline,
    case when 'current_position' = any(ep.hidden_fields) then null else ep.current_position end,
    case when 'current_company' = any(ep.hidden_fields) then null else ep.current_company end,
    case when 'years_experience' = any(ep.hidden_fields) then null else ep.years_experience_range end,
    case when 'short_bio' = any(ep.hidden_fields) then null else ep.short_bio end,
    case when 'expertise_summary' = any(ep.hidden_fields) then null else ep.expertise_summary end,
    case when 'problems_help_with' = any(ep.hidden_fields) then null else ep.problems_help_with end,
    case when 'who_i_help' = any(ep.hidden_fields) then null else ep.who_i_help end,
    case when 'career_highlights' = any(ep.hidden_fields) then null else ep.career_highlights end,
    case when 'linkedin' = any(ep.hidden_fields) then null else ep.linkedin_url end,
    case when 'location' = any(ep.hidden_fields) then null else ep.country end,
    case when 'location' = any(ep.hidden_fields) then null else ep.city end,
    case when 'photo' = any(ep.hidden_fields) then null else ep.profile_image_path end,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    case when 'languages' = any(ep.hidden_fields) then '{}'::text[] else ep.languages end,
    case when 'response_time' = any(ep.hidden_fields) then null else ep.response_time end,
    case when 'experience' = any(ep.hidden_fields) then '[]'::jsonb else ep.experience end,
    case when 'stats' = any(ep.hidden_fields) then 0 else st.sessions_completed end,
    case when 'stats' = any(ep.hidden_fields) or 'reviews' = any(ep.hidden_fields) then 0 else st.review_count end,
    case when 'stats' = any(ep.hidden_fields) or 'reviews' = any(ep.hidden_fields) then null else st.rating_avg end,
    case when 'stats' = any(ep.hidden_fields) then false else st.is_top_expert end
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  cross join lateral public.expert_public_stats(ep.id) st
  where ep.profile_status = 'published' and ep.slug = p_slug;
$$;
create or replace function public.get_expert_directory_public_v2()
returns table (
  slug text,
  headline text,
  current_position text,
  current_company text,
  profile_image_path text,
  online_enabled boolean,
  in_person_enabled boolean,
  full_name text,
  category_names text[],
  starting_price numeric,
  starting_duration_minutes integer,
  languages text[],
  sessions_completed integer,
  review_count integer,
  rating_avg numeric,
  is_top_expert boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ep.slug,
    ep.headline,
    case when 'current_position' = any(ep.hidden_fields) then null else ep.current_position end,
    case when 'current_company' = any(ep.hidden_fields) then null else ep.current_company end,
    case when 'photo' = any(ep.hidden_fields) then null else ep.profile_image_path end,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    cheapest.base_price,
    cheapest.duration_minutes,
    case when 'languages' = any(ep.hidden_fields) then '{}'::text[] else ep.languages end,
    case when 'stats' = any(ep.hidden_fields) then 0 else st.sessions_completed end,
    case when 'stats' = any(ep.hidden_fields) or 'reviews' = any(ep.hidden_fields) then 0 else st.review_count end,
    case when 'stats' = any(ep.hidden_fields) or 'reviews' = any(ep.hidden_fields) then null else st.rating_avg end,
    case when 'stats' = any(ep.hidden_fields) then false else st.is_top_expert end
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  cross join lateral public.expert_public_stats(ep.id) st
  left join lateral (
    select est.base_price, est.duration_minutes
    from public.expert_session_types est
    where est.expert_profile_id = ep.id and est.is_active = true
    order by est.base_price, est.duration_minutes
    limit 1
  ) cheapest on true
  where ep.profile_status = 'published'
  order by st.is_top_expert desc, st.sessions_completed desc, st.rating_avg desc nulls last,
    st.review_count desc, p.full_name;
$$;
create or replace function public.get_expert_reviews_public(p_slug text)
returns table (
  rating smallint,
  body text,
  reviewer_name text,
  duration_minutes integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.rating,
    r.body,
    case
      when p.full_name is null or btrim(p.full_name) = '' then 'Pivotroom client'
      when position(' ' in btrim(p.full_name)) = 0 then btrim(p.full_name)
      else split_part(btrim(p.full_name), ' ', 1) || ' '
        || upper(left(regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
    end,
    b.duration_minutes,
    r.created_at
  from public.expert_reviews r
  join public.expert_profiles ep on ep.id = r.expert_profile_id
  join public.bookings b on b.id = r.booking_id
  join public.profiles p on p.id = r.customer_id
  where ep.slug = p_slug
    and ep.profile_status = 'published'
    and not ('reviews' = any(ep.hidden_fields))
    and not r.is_hidden
  order by r.created_at desc
  limit 24;
$$;
create or replace function public.get_expert_match_candidates_public()
returns table (
  slug text,
  full_name text,
  headline text,
  current_position text,
  current_company text,
  category_names text[],
  expertise_summary text,
  problems_help_with text,
  who_i_help text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    ep.slug,
    p.full_name,
    left(ep.headline, 160),
    case when 'current_position' = any(ep.hidden_fields) then null else left(ep.current_position, 80) end,
    case when 'current_company' = any(ep.hidden_fields) then null else left(ep.current_company, 80) end,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    case when 'expertise_summary' = any(ep.hidden_fields) then null else left(ep.expertise_summary, 400) end,
    case when 'problems_help_with' = any(ep.hidden_fields) then null else left(ep.problems_help_with, 400) end,
    case when 'who_i_help' = any(ep.hidden_fields) then null else left(ep.who_i_help, 240) end
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  where ep.profile_status = 'published'
  order by p.full_name;
$function$;

-- ===== 051_revoke_matching_function.sql
revoke execute on function public.get_expert_match_candidates_public() from anon, authenticated;

-- ===== starter data (supabase/seed.sql)
insert into public.industries (name, slug) values
  ('Technology', 'technology'),
  ('Financial Services', 'financial-services'),
  ('Manufacturing', 'manufacturing'),
  ('Construction & Real Estate', 'construction-real-estate'),
  ('Professional Services', 'professional-services'),
  ('Retail & E-commerce', 'retail-ecommerce'),
  ('Hospitality & Tourism', 'hospitality-tourism'),
  ('Healthcare', 'healthcare'),
  ('Education', 'education'),
  ('Media & Entertainment', 'media-entertainment'),
  ('Agriculture', 'agriculture'),
  ('Logistics & Supply Chain', 'logistics-supply-chain'),
  ('Government & NGO', 'government-ngo'),
  ('Marketing & Advertising', 'marketing-advertising'),
  ('Consumer Goods', 'consumer-goods'),
  ('Energy', 'energy'),
  ('Other', 'other')
on conflict (slug) do nothing;
insert into public.expert_categories (name, slug, sort_order) values
  ('Career & Professional', 'career-professional', 1),
  ('Funding, Investment & Finance', 'funding-investment-finance', 2),
  ('Industry & Specialized Expertise', 'industry-specialized-expertise', 3),
  ('Leadership, Management & Operations', 'leadership-management-operations', 4),
  ('Marketing, Brand & Growth', 'marketing-brand-growth', 5),
  ('Product, Technology & AI', 'product-technology-ai', 6),
  ('Sales, Partnership & Expansion', 'sales-partnership-expansion', 7),
  ('Starting & Building a Business', 'starting-building-a-business', 8)
on conflict (slug) do nothing;

commit;
