-- 034_booking_functions.sql
-- Phase 5: booking policy constants, the slot-derivation layer, and the
-- only write path into bookings/booking_intake. Migrations 001-033 are
-- not modified.
--
-- Every mutation function resolves the caller's identity from auth.uid()
-- internally and never accepts customer_id/expert_profile_id/price/
-- status as trusted client input (spec sections 63, 64, 46, 47) -- the
-- same pattern used by every write function in this codebase since
-- Phase 2 (resolve_own_approved_expert_profile_id(), is_admin(), etc).

-- =========================================================================
-- Booking policy -- one named, centralized source per constant (spec
-- section 18), never a number scattered across components. Internal
-- only; the same values are mirrored as TypeScript constants in
-- types/booking.ts for client-side display, kept in sync by hand.
-- =========================================================================

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

-- =========================================================================
-- Availability derivation for booking -- internal only. Consumes the
-- FINAL Phase 4 availability model exactly as it stands (day-of-month
-- rules + per-occurrence overrides + one-off availability), never a
-- separate recurrence model (spec section 13).
-- =========================================================================

-- Every raw window on one calendar date: natural rule occurrences with
-- no override for that exact occurrence, UNION modified overrides
-- landing on that date (both already computed by
-- expert_recurring_and_override_windows_for_date(), 030 -- reused
-- unchanged), UNION one-off availability on that date (which that
-- function does not cover, since Phase 4's own UI computes one-offs
-- separately -- this is the one place both are combined).
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

-- Continuous ranges after merging touching/overlapping raw windows (spec
-- section 15) -- "4-5" and "5-6" become one "4-6" range for slot-fit
-- purposes; a genuine gap ("4-5" and "5:15-6") never merges.
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

-- "Does this exact local window fit entirely inside one merged window on
-- this date?" -- used by create_booking_hold() to independently
-- revalidate a candidate slot (spec section 45): never trust that the
-- frontend showed it earlier.
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

-- =========================================================================
-- get_bookable_slots() -- the one new public-facing RPC (spec section 23:
-- avoided where possible, but genuinely necessary here -- the Next.js
-- server has no more privilege than anon/authenticated itself, since
-- this codebase has never used a service-role key, so deriving 90 days
-- of merged availability minus active bookings for a published expert
-- cannot happen server-side without a controlled function like this one
-- to read through RLS on the expert's private availability tables).
--
-- Returns ONLY what a calendar needs (spec section 22): a UTC instant
-- pair per bookable slot, plus the expert's timezone for display. No
-- rule/override/one-off/booking IDs, no expert_profile_id, no private
-- applicant data -- an anonymous caller learns nothing beyond "this
-- published expert is bookable at these exact moments," which is exactly
-- what /book/[slug] already shows on the page.
-- =========================================================================

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
  -- Input validation/clamping (spec section 81) -- never trust a caller
  -- to ask for a reasonable range. Silently return zero rows for
  -- anything malformed rather than raising, so this behaves the same
  -- whether an expert doesn't exist, isn't published, or a parameter is
  -- simply invalid -- no detail to distinguish those cases either way.
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

-- =========================================================================
-- generate_booking_reference() -- internal only.
-- =========================================================================

create or replace function public.generate_booking_reference()
returns text
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  -- Uppercase letters + digits, excluding 0/O/1/I to avoid ambiguity when
  -- a customer reads this reference aloud or types it back in.
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

-- =========================================================================
-- create_booking_hold() -- the only way a booking row is ever created.
-- authenticated only; every check in spec section 64's list applies.
-- =========================================================================

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

  -- Expert resolved from the slug + current publication state -- never
  -- trusted from a client-supplied expert_profile_id (spec section 63).
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

  -- Enabled duration/format resolved server-side -- the price snapshot
  -- below comes from this row, never from a client-submitted amount
  -- (spec section 46).
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

  -- end_at is always derived server-side, never accepted from the client
  -- (spec section 47).
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
    -- A session that would cross local midnight can never be covered by
    -- a same-day availability window (they never cross midnight either,
    -- per Phase 4's own end_time > start_time constraint) -- reject
    -- cleanly instead of silently matching nothing below.
    raise exception 'That time is no longer available.' using errcode = '23514';
  end if;

  if not public.expert_window_is_available(v_expert_profile_id, v_local_date, v_local_start, v_local_end) then
    raise exception 'That time is no longer available.' using errcode = '23514';
  end if;

  -- Lazy cleanup (spec sections 33, 41): flip THIS expert's and THIS
  -- customer's own stale held/awaiting_payment rows to expired before
  -- attempting the insert, so the exclusion constraints below only ever
  -- see genuinely active rows. No cron needed for V1.
  update public.bookings
    set booking_status = 'expired'
    where booking_status in ('held', 'awaiting_payment')
      and hold_expires_at <= now()
      and (expert_profile_id = v_expert_profile_id or customer_id = v_customer_id);

  -- The exclusion constraints on public.bookings are the actual
  -- concurrency-safe backstop (spec section 42): two simultaneous calls
  -- can both pass every check above, but only one INSERT can succeed --
  -- the other raises exclusion_violation, caught below.
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
        -- Reference collision (astronomically unlikely) -- retry with a
        -- freshly generated one rather than fail the whole booking.
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

-- =========================================================================
-- save_booking_intake() -- upserts the one intake row for a booking the
-- caller owns.
-- =========================================================================

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

-- =========================================================================
-- advance_booking_to_awaiting_payment() -- the only Phase 5 transition
-- besides expiry. Never reachable: held/awaiting_payment -> confirmed
-- (spec section 37) -- no function in this migration writes 'confirmed'.
-- =========================================================================

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
    -- Idempotent: an already-advanced booking just gets a fresh
    -- expiration (e.g. the customer clicked Continue to Payment again).
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

  -- "Required V1 professional profile fields" (spec section 48) --
  -- reuses Phase 1's own field set (current_role, employment_type,
  -- industry_id, years_experience_range) rather than inventing a second
  -- definition. company_name/linkedin_url stay optional, matching Phase
  -- 1. Phase 1's own profile page is unchanged by this -- those fields
  -- stay optional there; this is a booking-specific completeness gate.
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
