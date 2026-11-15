-- 063: Chapa checkouts a customer leaves unfinished.
--
-- The booking card used to dead-end on "Payment processing" whenever a
-- Chapa checkout was opened but not completed: Chapa's verify answers "not
-- paid yet", the attempt stays 'initiated', and nothing let the customer
-- go back to Chapa or pay by bank transfer. The app now lets them leave
-- the attempt (mark_own_chapa_payment_failed with 'abandoned_by_customer',
-- after re-checking with Chapa) and start again.
--
-- Safety net, here: if Chapa later confirms that left checkout as paid
-- (they paid on the old page after all), finalize_chapa_payment flags it
-- 'requires_review' for the team rather than ignoring a real payment.
-- Everything else is unchanged from 044.

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

  -- 063: a customer can leave an unfinished Chapa checkout (marked failed,
  -- provider_status 'abandoned_by_customer') and pay another way. If Chapa
  -- later reports that old checkout as PAID after all, the money must not
  -- be ignored: flag it for the team instead of short-circuiting.
  if v_payment.payment_status = 'failed' and p_verified_status = 'success' then
    update public.payments
      set payment_status = 'requires_review',
          provider_status = p_verified_status,
          provider_reference = coalesce(p_provider_reference, provider_reference),
          provider_mode = coalesce(p_provider_mode, provider_mode),
          verified_at = now()
      where id = v_payment.id;
    select b.booking_status into v_booking.booking_status from public.bookings b where b.id = v_payment.booking_id;
    final_payment_status := 'requires_review';
    final_booking_status := v_booking.booking_status;
    newly_finalized := true;
    return next;
    return;
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
  'service_role ONLY. Same as 044, plus (063): a Chapa success reported for an attempt already marked failed (e.g. a checkout the customer left) becomes requires_review instead of being ignored. Idempotent and race-safe via FOR UPDATE row locking.';

revoke execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text, text) to service_role;
