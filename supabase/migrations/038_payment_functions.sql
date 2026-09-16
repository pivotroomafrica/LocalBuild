-- 038_payment_functions.sql
-- Phase 6: the manual-payment policy constant and the only write path
-- into payments -- submit_manual_payment() (customer), and
-- verify_manual_payment()/reject_manual_payment() (admin). Migrations
-- 001-037 are not modified.
--
-- Every function resolves the caller's identity from auth.uid()
-- internally (customer functions) or additionally requires
-- public.is_admin() (admin functions) -- the same pattern used by every
-- write function in this codebase since Phase 2. None of them accept
-- customer_id/booking ownership/payment status as trusted client input.

-- =========================================================================
-- Manual-payment policy -- one named constant (spec section 16), not a
-- number scattered across components. Mirrored by hand as a TypeScript
-- constant in types/payment.ts for display only.
-- =========================================================================

create or replace function public.manual_payment_verification_hold_hours()
returns int
language sql
immutable
set search_path = public
as $$ select 24; $$;

revoke execute on function public.manual_payment_verification_hold_hours() from public, anon, authenticated;

-- =========================================================================
-- submit_manual_payment() -- the only way a payments row is created.
-- authenticated only.
-- =========================================================================
--
-- Hold-policy interaction (spec sections 15, 16, 39, 40): a manual bank
-- transfer can take far longer than the 15-minute short hold Phase 5
-- uses while a customer is actively on the payment page. Rather than add
-- a second, competing expiry column, this function extends the SAME
-- bookings.hold_expires_at Phase 5 already uses to
-- now() + manual_payment_verification_hold_hours() the moment a real
-- submission is recorded -- get_bookable_slots() and the exclusion
-- constraints (032_bookings.sql) already respect this column for
-- 'awaiting_payment' bookings, so the slot correctly stays blocked for
-- the whole verification window with zero changes to Phase 5's schema
-- or slot-derivation logic. Nothing is extended merely by *visiting* the
-- payment page (spec section 41) -- only an actual successful submission
-- reaches the UPDATE below.
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

  -- Ownership resolved from the booking's own customer_id, never trusted
  -- from client input (spec section 31) -- a reference belonging to
  -- another customer is indistinguishable from one that doesn't exist.
  select * into v_booking
  from public.bookings
  where booking_reference = p_booking_reference
    and customer_id = v_customer_id
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;

  -- Lazy expiry check (spec section 39, same no-cron pattern as
  -- create_booking_hold, 034): a stale row can still read
  -- booking_status = 'awaiting_payment' after its hold_expires_at has
  -- already passed. Flip it and block the submission rather than
  -- accepting payment details against a slot that may no longer be the
  -- customer's.
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

  -- Server-validated only: > 0. Never compared to expected_amount here --
  -- a mismatch is accepted and flagged to admin, not auto-rejected (spec
  -- section 46).
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
      -- A double-click / concurrent resubmission racing the partial
      -- unique index (payments_one_pending_per_booking, 036) -- treat as
      -- idempotent rather than erroring: return the pending attempt that
      -- already exists instead of creating a duplicate (spec section 17,
      -- 72).
      select id into v_payment_id
      from public.payments
      where booking_id = v_booking.id and payment_status = 'pending_verification'
      order by submitted_at desc
      limit 1;
  end;

  -- Refresh/replace the short Phase 5 hold with the manual-verification
  -- reservation window. booking_status stays 'awaiting_payment' (spec
  -- section 14) -- this function never confirms a booking.
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

-- =========================================================================
-- verify_manual_payment() -- admin only. Atomically transitions BOTH the
-- payment and the booking together (spec sections 23, 33, 62): if
-- anything after the payment UPDATE fails, the whole function call rolls
-- back, since a single PL/pgSQL function invocation is one transaction.
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

  -- Stale-admin / concurrent-action guard (spec sections 34, 76): a
  -- second admin action against a payment that already moved on (by
  -- another admin, or otherwise) fails cleanly instead of silently
  -- re-applying.
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

  -- The first and only Phase 6 path to booking_status = 'confirmed'
  -- (spec section 35) -- hold_expires_at is cleared: a confirmed booking
  -- is a real appointment, not a hold, and the exclusion constraints
  -- (032_bookings.sql) already include 'confirmed' in their active-status
  -- predicate regardless of hold_expires_at, so clearing it does not
  -- weaken overlap protection (spec section 38, 79).
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

-- =========================================================================
-- reject_manual_payment() -- admin only. Booking remains awaiting_payment
-- (spec section 24); the customer may resubmit (spec section 25).
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

  -- Booking is deliberately NOT touched -- it remains exactly
  -- 'awaiting_payment' with whatever hold_expires_at the submission
  -- already set, so the slot stays reserved while the customer decides
  -- whether to resubmit (spec section 24). A later resubmission
  -- (submit_manual_payment again) naturally refreshes the window.
end;
$$;

comment on function public.reject_manual_payment(uuid, text) is
  'Admin-only. pending_verification -> rejected, with a required reason. Never changes booking_status -- the booking stays awaiting_payment so the customer can resubmit.';

revoke execute on function public.reject_manual_payment(uuid, text) from public, anon;
grant execute on function public.reject_manual_payment(uuid, text) to authenticated;
