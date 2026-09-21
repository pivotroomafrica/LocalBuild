-- 044_phase9_integration_jobs.sql
-- Phase 9: transactional notifications + Google Calendar + Google Meet.
-- Migrations 001-043 are not modified.
--
-- ARCHITECTURE (spec sections 2, 5, 6, 7):
--   Booking/payment/availability remain the sole source of truth.
--   Notifications and Calendar/Meet are SIDE EFFECTS, never a dependency
--   of booking confirmation succeeding. This is implemented as a durable
--   outbox: `integration_jobs`. The moment a booking is confirmed (inside
--   verify_manual_payment()/finalize_chapa_payment(), both already one
--   atomic transaction each), this migration adds ONE extra step to that
--   same transaction -- registering the side-effect jobs as rows in
--   integration_jobs. That's a plain INSERT, not an external API call, so
--   it's safe to do inside the existing transaction (spec section 6: only
--   the *external* HTTP calls -- Resend, Google -- must never happen
--   inside a DB transaction, and they don't; a separate worker, run over
--   HTTP from outside Postgres, does those after the confirm has already
--   committed).
--
-- Both confirmation paths (manual admin verify, Chapa provider-verified
-- success) call the exact same register_booking_confirmation_jobs() --
-- one booking-confirmation lifecycle, not two parallel integrations
-- (spec section 4).

-- =========================================================================
-- Scheduler groundwork (spec section 38): pg_cron + pg_net, both already
-- available on this project (confirmed via list_extensions before writing
-- this migration) but not yet installed. Enabling them here is a no-op by
-- itself -- no cron job is scheduled by this migration. The actual
-- `cron.schedule(...)` call needs this deployment's real public URL,
-- which isn't known at migration-write time (this was built against a
-- local ngrok tunnel, not a production domain) -- see the completion
-- report's "WHAT I NEED TO CONFIGURE" for the exact command to run once
-- a real production URL exists.
-- =========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- =========================================================================
-- integration_jobs -- the outbox (spec sections 7, 51). Deliberately one
-- table, not a family of emails/email_logs/notification_jobs/calendar_jobs
-- tables (spec section 50).
-- =========================================================================

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
  -- Only reminders use this (offset_minutes: 1440 or 60) -- a small jsonb
  -- payload instead of a dedicated column used by 2 of 6 job types (spec
  -- section 7's "keep V1 understandable").
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  scheduled_for timestamptz not null default now(),
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  -- Sanitized only (spec section 53) -- the worker (lib/jobs/*) never
  -- writes a raw provider error/access-token/auth-header into this
  -- column, only a short human-readable reason.
  last_error text,
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.integration_jobs is
  'Outbox for Phase 9 post-confirmation side effects (emails, Calendar/Meet, reminders). Registered atomically inside the same transaction as booking confirmation; processed afterward by a separate worker over HTTP, never inside a DB transaction (spec section 6). No secrets are ever stored here (spec section 52).';

-- dedupe_key alone is the idempotency guarantee (spec sections 8, 39, 71):
-- 'confirm_email_customer:<booking_id>', 'calendar_create:<booking_id>',
-- 'reminder_customer_24h:<booking_id>', 'payment_rejected:<payment_id>',
-- etc. A second registration attempt for the same booking/payment
-- collides on this unique index and is silently skipped (ON CONFLICT DO
-- NOTHING in register_booking_confirmation_jobs() below) -- running
-- confirmation twice never produces two calendar events or two emails.
create unique index integration_jobs_dedupe_key_idx on public.integration_jobs (dedupe_key);

-- What the worker polls: due, not-yet-attempted-past-the-limit jobs.
create index integration_jobs_worker_idx on public.integration_jobs (scheduled_for)
  where status = 'pending';

create index integration_jobs_booking_id_idx on public.integration_jobs (booking_id);

create trigger integration_jobs_set_updated_at
  before update on public.integration_jobs
  for each row execute function public.set_updated_at();

alter table public.integration_jobs enable row level security;

-- Admin-only read (spec section 32) -- customers/experts never see job
-- rows (internal operational data, error text included). No INSERT/
-- UPDATE/DELETE policy for `authenticated` at all: registration happens
-- only from inside the SECURITY DEFINER confirmation functions below, and
-- the worker (lib/jobs/*) runs with the service_role key (same pattern as
-- Chapa's finalize_chapa_payment / lib/supabase/service.ts, 042), which
-- bypasses RLS -- never a direct authenticated-role grant on this table.
create policy integration_jobs_select_admin on public.integration_jobs
  for select
  to authenticated
  using (public.is_admin());

-- =========================================================================
-- Calendar/Meet state lives directly on bookings (spec section 51's
-- "or booking columns" option) -- one row per booking already exists;
-- a separate 1:1 table would add a join for zero benefit. Read access
-- rides on the bookings RLS policies that already exist (bookings_
-- select_own / bookings_select_own_expert / bookings_select_admin, 033/
-- 039) -- no new RLS needed for the customer/expert dashboards to show
-- the Meet link once synced (spec sections 26, 27, 78, 79).
-- =========================================================================

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

-- =========================================================================
-- session_reminder_offsets_minutes() -- policy constant (spec section 37),
-- same named-function pattern as booking_hold_minutes()/chapa_checkout_
-- hold_minutes() rather than a number scattered across call sites.
-- =========================================================================

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

-- =========================================================================
-- register_booking_confirmation_jobs() -- internal only (never granted to
-- any role), called from inside verify_manual_payment()/
-- finalize_chapa_payment() below, in the SAME transaction as the
-- confirmation itself (spec sections 5, 9). Idempotent via ON CONFLICT on
-- dedupe_key -- calling this twice for the same booking (e.g. a retried
-- admin action, or the late-success edge case) registers nothing extra
-- (spec sections 8, 71).
--
-- Reminders skip any offset whose target time has already passed (spec
-- sections 42, 81) -- a booking confirmed 3 hours before its start gets
-- only the 1h reminder, never a nonsensical immediate "24h reminder".
-- =========================================================================

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

-- =========================================================================
-- register_payment_rejected_job() -- same pattern, one job type.
-- =========================================================================

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

-- =========================================================================
-- verify_manual_payment() -- CREATE OR REPLACE of the existing 038
-- function. Identical logic, plus one call registering Phase 9 jobs
-- right after the booking is confirmed, in the same transaction (spec
-- sections 5, 9, 84).
-- =========================================================================

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

-- =========================================================================
-- reject_manual_payment() -- CREATE OR REPLACE, plus registering the
-- rejection email job (spec sections 35, 83).
-- =========================================================================

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

-- =========================================================================
-- finalize_chapa_payment() -- CREATE OR REPLACE of the 043 version.
-- Identical logic, plus the same register_booking_confirmation_jobs()
-- call, only in the branch that actually confirms the booking (spec
-- section 85) -- never in the failed/pending/requires_review branches.
-- =========================================================================

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

-- =========================================================================
-- get_booking_notification_context() -- service_role ONLY (spec sections
-- 54, 55: never trust a client-supplied email; resolve server-side from
-- the authenticated account/ownership relationship). Reads auth.users
-- directly for email, same established pattern as handle_new_user() (001)
-- -- email is deliberately not duplicated into public.profiles.
-- =========================================================================

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

-- =========================================================================
-- admin_retry_integration_job() -- admin only (spec section 33). Only
-- ever moves a genuinely 'failed' job back to pending; never touches a
-- pending/processing/completed one, so this can't be used to force a
-- second calendar event/email for an already-completed job.
-- =========================================================================

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

-- =========================================================================
-- admin_backfill_booking_integrations() -- controlled backfill (spec
-- section 10) for a confirmed booking that predates Phase 9. Admin must
-- explicitly choose one booking at a time -- no bulk "email everyone"
-- migration-time backfill.
-- =========================================================================

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
