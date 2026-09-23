-- 045_phase10_reschedule_cancellation.sql
-- Phase 10: customer/admin rescheduling, customer/expert/admin
-- cancellation, expert reschedule requests. Migrations 001-044 are not
-- modified.
--
-- CORE PRINCIPLE (spec section 2): booking remains the source of truth.
-- Google Calendar is a synchronized representation, email is a
-- notification, payment records are financial history. A reschedule
-- changes an EXISTING booking's start_at/end_at; it never deletes and
-- recreates a booking, and never issues a new booking_reference.
--
-- NO FINANCIAL LOGIC (spec sections 3, 41, 87-90): no refund calculation,
-- no Chapa refund call, no payout adjustment. A cancelled paid booking
-- only ever gets financial_followup_required = true -- an objective flag
-- for Phase 11, never a computed refund amount or a payment_status
-- mutation. verified stays verified.

-- =========================================================================
-- Policy constants (spec section 4) -- same named-function pattern as
-- booking_min_notice_hours()/chapa_checkout_hold_minutes().
-- =========================================================================

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

-- =========================================================================
-- booking_reschedules -- append-only audit trail (spec sections 21, 78).
-- Only ever written by reschedule_booking()/admin_reschedule_booking()
-- below, inside the same transaction as the booking's start_at/end_at
-- update. No UPDATE/DELETE grant to any role -- immutability is
-- structural, not just convention.
-- =========================================================================

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

-- Owner-scoped read (spec section 83): the booking's own customer, the
-- booking's own expert, or an admin -- never a different customer/expert
-- (spec sections 112-113). No INSERT/UPDATE/DELETE policy for
-- `authenticated` at all -- rows are only ever created by the SECURITY
-- DEFINER functions below.
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

-- =========================================================================
-- booking_cancellations -- append-only audit trail (spec sections 39, 79).
-- financial_followup_required is an objective flag only -- never a refund
-- amount or approval (spec sections 40-41, 88).
-- =========================================================================

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

-- =========================================================================
-- booking_change_requests -- expert-initiated reschedule REQUEST (spec
-- sections 27-32). Creating a request never changes bookings.start_at/
-- end_at (spec section 29) -- the booking is only ever actually moved by
-- the customer's own subsequent reschedule_booking() call, or by admin.
-- Prefer-the-simpler-safe-version (spec section 27): no proposed-slot
-- hold is created merely by proposing a time (spec section 30).
-- =========================================================================

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
-- At most one PENDING request per booking at a time -- an expert cannot
-- pile up multiple unanswered requests on the same session.
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

-- =========================================================================
-- integration_jobs job_type vocabulary extended (spec sections 44, 54-65)
-- -- same one-table outbox from Phase 9, no new job/notification tables
-- (spec section 50 in Phase 9 still applies: keep V1 understandable).
-- =========================================================================

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

-- =========================================================================
-- get_booking_notification_context() -- CREATE OR REPLACE, additive
-- booking_status column only (spec section 62's reminder defense-in-depth:
-- the worker re-checks booking_status = 'confirmed' immediately before
-- sending a reminder, never trusting only "the job still exists").
-- Everything else identical to the Phase 9 (044) version.
-- =========================================================================

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

-- =========================================================================
-- get_bookable_slots() -- CREATE OR REPLACE, adds an optional
-- p_exclude_booking_id parameter (spec section 15): when rescheduling,
-- the booking being moved must not block itself out of its own
-- candidate-slot search, while every OTHER booking still blocks time
-- exactly as before. Backward compatible -- existing callers (the normal
-- new-booking flow) simply never pass it, defaulting to null (no
-- exclusion, unchanged behavior).
-- =========================================================================

-- Dropped and recreated (not just CREATE OR REPLACE) because adding a
-- trailing parameter changes this function's identity in Postgres --
-- without the drop, the old 6-parameter version would remain as a
-- separate overload, and PostgREST cannot always disambiguate an RPC
-- call between two overloads that both match the supplied named
-- parameters. Exactly one get_bookable_slots exists after this migration.
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

-- =========================================================================
-- register_booking_reschedule_jobs() -- internal only. Called from inside
-- reschedule_booking()/admin_reschedule_booking() in the SAME transaction
-- as the booking's start_at/end_at update (spec section 18: atomic).
--
-- Calendar: exactly one 'calendar_update' job, reusing the booking's
-- existing calendar_event_id (never a new calendar_create -- spec
-- sections 54-55). Keyed by this reschedule's own id, so a booking
-- rescheduled multiple times gets one job per reschedule, never a
-- duplicate for the same reschedule event.
--
-- Reminders (spec sections 60-61): existing session_reminder_customer/
-- expert rows for this booking are recomputed against the NEW start_at.
-- A reminder whose new fire time has already passed is deleted outright
-- (never fires for the old time, spec section 60); one whose new fire
-- time is still in the future is reset back to pending with a fresh
-- scheduled_for, attempt_count, and cleared completed_at/last_error --
-- even if it had already completed for the old time, so a customer who
-- already got their "tomorrow" reminder for the OLD date still gets a
-- correct one for the NEW date, without a second dedupe_key ever being
-- needed (spec section 61: no duplicate-accumulation across repeated
-- reschedules).
-- =========================================================================

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
      -- An already-completed reminder for a NOW-past window is left as
      -- historical record (it genuinely fired once); it is simply never
      -- reset to pending, so it cannot fire again for the old time.
    end if;
  end loop;
end;
$$;

comment on function public.register_booking_reschedule_jobs(uuid, uuid) is
  'Internal only. Registers Phase 10 reschedule side-effect jobs (calendar_update, both reschedule emails) and rebuilds session_reminder_* jobs against the booking''s NEW start_at, deleting any reminder whose new fire time has already passed. Called from inside reschedule_booking()/admin_reschedule_booking() in the same transaction as the start_at/end_at update.';

revoke execute on function public.register_booking_reschedule_jobs(uuid, uuid) from public, anon, authenticated;

-- =========================================================================
-- register_booking_cancellation_jobs() -- internal only. Called from
-- inside cancel_customer_booking()/cancel_expert_booking()/
-- admin_cancel_booking() in the same transaction as the booking_status
-- update. Deletes all still-pending reminders outright (spec section 62:
-- a cancelled booking gets NO future reminders) -- this is on top of,
-- never instead of, the reminder handler''s own defense-in-depth
-- booking_status check (spec section 62''s "defense in depth" wording).
-- =========================================================================

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

-- =========================================================================
-- reschedule_booking() -- customer-facing (spec sections 12-25, 71, 74).
-- Same expert, same duration, same format, same price -- none of those
-- are even parameters, so there is no code path that could accept a
-- client-supplied override for any of them (spec sections 8-10, 74).
-- Cutoff (spec sections 4-5) enforced server-side against now(), never
-- browser time. New slot re-validated against the SAME Phase 4 engine
-- (expert_window_is_available) used for original booking (spec section
-- 14), and the exclusion constraints on public.bookings (033) are what
-- actually make the UPDATE concurrency-safe (spec sections 17-18): two
-- simultaneous reschedules into the same slot can both pass every check
-- below, but only one UPDATE can commit -- the loser gets
-- exclusion_violation, caught below, and the caller''s ORIGINAL booking
-- is left completely untouched (spec section 19), because the failed
-- UPDATE never applied at all.
-- =========================================================================

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

  -- Server time is authoritative (spec section 4) -- the cutoff is
  -- checked against the booking''s CURRENT start_at, never the browser''s
  -- clock and never the new proposed time.
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

  -- A pending expert-initiated request against this booking is resolved
  -- by the customer''s own successful reschedule (spec section 27''s
  -- "prefer the simpler safe version" -- no separate accept step).
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

-- =========================================================================
-- admin_reschedule_booking() -- admin-only (spec sections 33-34, 73, 77).
-- Bypasses the 24h cutoff; NEVER bypasses the exclusion-constraint
-- double-booking protection (spec section 33: "admin cannot place two
-- bookings in same time").
-- =========================================================================

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

-- =========================================================================
-- cancel_customer_booking() -- customer-only (spec sections 36-38, 75).
-- =========================================================================

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

-- =========================================================================
-- cancel_expert_booking() -- expert-only (spec sections 47-49, 76). May
-- bypass the customer cutoff (the expert genuinely cannot provide the
-- session) -- reason is mandatory either way.
-- =========================================================================

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

-- =========================================================================
-- admin_cancel_booking() -- admin-only (spec section 50).
-- =========================================================================

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

-- =========================================================================
-- request_expert_reschedule() / decline_expert_reschedule_request() --
-- expert-request flow (spec sections 26-32, 76).
-- =========================================================================

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

  -- Proposing a time never reserves it (spec section 30) -- this is
  -- purely informational, re-validated in full if/when the customer
  -- actually reschedules to it via reschedule_booking().
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
