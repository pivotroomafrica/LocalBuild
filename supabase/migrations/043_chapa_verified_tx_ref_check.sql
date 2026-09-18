-- 043_chapa_verified_tx_ref_check.sql
-- Phase 8 follow-up: finalize_chapa_payment() (042) locks and updates the
-- local payment row via p_provider_tx_ref (the tx_ref THIS project looked
-- up and asked Chapa to verify) -- never via anything Chapa's response
-- itself claims -- so a response that names a different tx_ref can never
-- cause the wrong LOCAL row to be updated. But 042 did not yet check
-- whether Chapa's own verify response agrees that it is describing the
-- transaction we asked about at all: a 'success' response whose amount/
-- currency happen to match the local row was finalized as verified even
-- if the response's own reported tx_ref did not match (spec's "mock wrong
-- tx_ref" scenario: "provider response tx_ref doesn't match local payment
-- -> do NOT confirm"). This migration closes that gap by adding an
-- optional p_verified_tx_ref argument -- the tx_ref Chapa's verify
-- response itself reported, when present -- and folding a mismatch into
-- the exact same "financial signal looks off, never silently confirm or
-- silently discard it" requires_review path 042 already uses for an
-- amount/currency mismatch, rather than inventing a second exceptional
-- state.
--
-- Only public.finalize_chapa_payment is changed. Its argument list grows
-- (a new optional trailing parameter), which Postgres treats as a
-- different function identity, so the old 6-arg overload is dropped
-- explicitly rather than left behind as dead code. No other Phase 8
-- function, table, or grant changes.

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

  -- Idempotency: a terminal payment is never re-processed.
  if v_payment.payment_status in ('verified', 'failed', 'requires_review') then
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := v_payment.payment_status;
    final_booking_status := v_booking.booking_status;
    newly_finalized := false;
    return next;
    return;
  end if;

  -- Record what Chapa reported regardless of outcome (audit/display only).
  update public.payments
    set provider_status = p_verified_status,
        provider_reference = coalesce(p_provider_reference, provider_reference),
        provider_mode = coalesce(p_provider_mode, provider_mode)
    where id = v_payment.id;

  if p_verified_status = 'pending' then
    -- Still processing -- no state change, caller may check again later
    -- (via another callback hit or the next webhook delivery).
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

  -- p_verified_status = 'success' -- verify the facts match before
  -- trusting it (spec sections 23-25). Exact match required; no
  -- overpayment/underpayment tolerance in Phase 8. A verify response that
  -- names a different tx_ref than the one we asked about is the same
  -- kind of "financial signal looks off" case as an amount/currency
  -- mismatch -- never silently confirmed, never silently discarded.
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

  -- Late success: the money is genuinely verified, but the reservation
  -- is no longer safely confirmable (expired/released/already resolved).
  -- Never silently confirm (would risk a double booking) and never
  -- silently drop the evidence that Chapa reported success.
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
