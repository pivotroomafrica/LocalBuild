-- 047d: payments charge the VAT-inclusive total; Chapa refuses amounts
-- above the manual-verification threshold. See 047b for the rules.

-- 3. Charge the VAT-inclusive total ----------------------------------------
-- Both functions are the live definitions with only the charged amount
-- changed (base_price -> coalesce(total_price, base_price)) and, for
-- Chapa, the manual-verification threshold check added.

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

  -- Same lazy-expiry pattern as submit_manual_payment() (038).
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

  -- V2: large payments are verified manually (bank transfer) instead of
  -- auto-confirmed through Chapa.
  select manual_verification_threshold into v_threshold from public.platform_settings where id;
  if v_threshold is not null and v_amount > v_threshold then
    raise exception 'Payments above % % are verified manually. Please pay by bank transfer.',
      to_char(v_threshold, 'FM999,999,999'), v_booking.currency
      using errcode = '23514';
  end if;

  -- No conflicting active Chapa attempt already exists -- reuse it
  -- (idempotent, spec section 42) instead of creating a second one.
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
      -- Double-click racing the partial unique index -- same idempotent
      -- pattern as submit_manual_payment() (spec section 43).
      select id into v_payment_id
      from public.payments
      where booking_id = v_booking.id and payment_method = 'chapa' and payment_status = 'initiated'
      order by created_at desc
      limit 1;
  end;

  -- Reserve the slot for the finite Chapa checkout window (spec sections
  -- 29-30).
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

  -- Ownership resolved from the booking's own customer_id, never trusted
  -- from client input (spec section 31).
  select * into v_booking
  from public.bookings
  where booking_reference = p_booking_reference
    and customer_id = v_customer_id
  for update;

  if v_booking.id is null then
    raise exception 'Booking not found.' using errcode = '42501';
  end if;

  -- Lazy expiry check (spec section 39).
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
  -- a mismatch is accepted and flagged to admin (spec section 46).
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

  -- booking_status stays 'awaiting_payment' -- this never confirms.
  update public.bookings
    set hold_expires_at = now() + make_interval(hours => public.manual_payment_verification_hold_hours())
    where id = v_booking.id;

  return v_payment_id;
end;
$function$;
