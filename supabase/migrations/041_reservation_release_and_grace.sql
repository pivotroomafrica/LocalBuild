-- 041_reservation_release_and_grace.sql
-- Pre-next-phase repair: a rejected manual payment left its booking
-- reserved with whatever was left of the ORIGINAL 24-hour submission-time
-- verification hold (up to 24 hours, no fresh deadline, no visible timer,
-- no release path) -- effectively unbounded from a product standpoint.
-- Migrations 001-040 are not modified.
--
-- Three changes:
--   1. payment_rejection_grace_minutes() -- one new named policy constant
--      (120 minutes for V1), same "centralized, not scattered" pattern as
--      every other policy constant since Phase 5 (034/038).
--   2. reject_manual_payment() (038) is redefined (create or replace,
--      038's own file is untouched) to additionally set a FRESH, short
--      hold_expires_at from the moment of rejection -- replacing whatever
--      was left of the submission-time window, not extending it.
--   3. Two new RPCs: release_booking_reservation() (customer, own booking
--      only) and admin_release_booking_reservation() (admin only) -- both
--      just flip an unconfirmed reservation to 'expired' immediately,
--      freeing the slot right away rather than waiting out any hold.
--
-- No change was needed to submit_manual_payment(), create_booking_hold(),
-- or get_bookable_slots(): all three already operate generically on
-- hold_expires_at/booking_status regardless of *why* that hold exists, so
-- a rejection-grace window already gets the exact same lazy-expiry and
-- resubmission-extends-the-hold behavior those functions already give
-- the original Phase 5/6 holds, with zero code changes -- see the
-- migration's own PR description for the full reasoning.

-- =========================================================================
-- Policy constant
-- =========================================================================

create or replace function public.payment_rejection_grace_minutes()
returns int
language sql
immutable
set search_path = public
as $$ select 120; $$;

revoke execute on function public.payment_rejection_grace_minutes() from public, anon, authenticated;

-- =========================================================================
-- reject_manual_payment() -- redefined. Same admin-only/reason-required
-- behavior as 038's original, plus one addition: a fresh grace window on
-- the booking. booking_status is still deliberately left at
-- 'awaiting_payment' (spec: the customer may resubmit) -- only
-- hold_expires_at changes.
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

  -- The fix: a fresh, short, named deadline starting NOW, replacing
  -- whatever was left of the original 24-hour submission-time window --
  -- never left open-ended. booking_status stays 'awaiting_payment' so the
  -- customer can resubmit; every existing lazy-expiry check
  -- (submit_manual_payment, create_booking_hold) and the active-booking
  -- exclusion in get_bookable_slots already respect this column exactly
  -- as they did for the original hold, so the slot correctly stays
  -- reserved only until this deadline, then opens up automatically with
  -- no cron and no other code change.
  update public.bookings
    set hold_expires_at = now() + make_interval(mins => public.payment_rejection_grace_minutes())
    where id = v_payment.booking_id;
end;
$$;

comment on function public.reject_manual_payment(uuid, text) is
  'Admin-only. pending_verification -> rejected, with a required reason. Never changes booking_status -- the booking stays awaiting_payment so the customer can resubmit -- but sets a fresh, short (payment_rejection_grace_minutes()) hold_expires_at from the moment of rejection, replacing whatever was left of the original verification-hold window, so a rejected booking is never held indefinitely.';

revoke execute on function public.reject_manual_payment(uuid, text) from public, anon;
grant execute on function public.reject_manual_payment(uuid, text) to authenticated;

-- =========================================================================
-- release_booking_reservation() -- customer self-service abandonment of
-- their OWN unconfirmed reservation (held or awaiting_payment only, never
-- confirmed). Not cancellation of a real appointment -- there is no such
-- feature in this codebase; this only ever un-reserves a hold.
-- =========================================================================
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

-- =========================================================================
-- admin_release_booking_reservation() -- same effect, admin-only, for a
-- stuck/rejected reservation the admin knows should not be retried. Never
-- reaches a confirmed booking -- this is not cancellation/refund.
-- =========================================================================
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
