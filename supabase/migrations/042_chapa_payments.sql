-- 042_chapa_payments.sql
-- Phase 8: Chapa as a second payment method, integrated into the existing
-- generic public.payments table (036_payments.sql already anticipated
-- this -- payment_status's CHECK constraint already allowed
-- 'initiated'/'paid'/'failed'/'refunded', and its own comment says "a
-- future Chapa integration should be able to add rows to this same table
-- rather than needing a parallel one"). Migrations 001-041 are not
-- modified.
--
-- Design summary:
--   1. payment_method CHECK widened to allow 'chapa' alongside 'manual'.
--   2. bank_used/transaction_reference (manual-only fields) made nullable,
--      with a new CHECK requiring them only when payment_method = 'manual'.
--   3. New Chapa-only columns: provider_tx_ref (Pivotroom-generated,
--      unique, sent to Chapa as tx_ref), provider_reference (Chapa's own
--      returned reference), provider_status (last raw provider status
--      string, display/audit only -- never the authority for a state
--      transition), provider_mode ('test'/'live', derived from which
--      secret key was used), initialized_at.
--   4. payment_status CHECK widened to add 'requires_review' -- the
--      narrow exceptional state for "Chapa verified the money moved, but
--      the reservation is no longer safely confirmable" (spec section
--      32/33: e.g. the booking's hold already expired and the slot may
--      have been taken by someone else before the success notification
--      arrived). Admin investigates manually; Phase 8 does not auto-
--      refund or auto-confirm out of this state.
--   5. A new partial unique index enforces "at most one ACTIVE (initiated)
--      Chapa attempt per booking" -- the same atomic-constraint pattern
--      payments_one_pending_per_booking (036) already uses for manual
--      submissions, not application-layer double-click checks alone.
--   6. Five new functions: chapa_checkout_hold_minutes() (policy
--      constant), generate_chapa_tx_ref() (internal), and three RPCs --
--      create_chapa_payment_attempt() (customer), mark_own_chapa_payment_
--      failed() (customer, used only when the Chapa HTTP initialize call
--      itself fails after the local row was created), and
--      finalize_chapa_payment() (service_role only -- the sole path that
--      can ever write payment_status = 'verified' for a Chapa row or
--      confirm the booking from one; called exclusively from server-side
--      webhook/return-route code after Chapa's own Verify Transaction API
--      has been called directly, never from an untrusted webhook/callback
--      payload's own status field).
--
-- No RLS migration needed: payments_select_own / payments_select_admin
-- (037) already scope every row (both methods) by customer_id/is_admin()
-- generically -- a Chapa row is not special-cased there. No new
-- INSERT/UPDATE/DELETE grant is added for authenticated on payments
-- itself; every Chapa write still goes exclusively through the SECURITY
-- DEFINER functions below, same as manual.

-- =========================================================================
-- Schema changes
-- =========================================================================

alter table public.payments
  drop constraint payments_payment_method_check,
  add constraint payments_payment_method_check check (payment_method in ('manual', 'chapa'));

alter table public.payments
  alter column bank_used drop not null,
  alter column transaction_reference drop not null;

-- bank_used/transaction_reference's original inline CHECKs
-- (char_length(...) between 1 and N) were dropped implicitly by making
-- the columns nullable being insufficient on their own -- Postgres NOT
-- NULL and CHECK are independent, so the original "not null check (...)"
-- column constraints remain as two separate constraints. Replace both
-- with method-conditional versions so a null value is allowed for a
-- Chapa row but a non-null one is still length-validated for either
-- method, and both are still required for a manual row.
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

-- At most one ACTIVE Chapa attempt per booking at a time (spec sections
-- 13, 42, 43) -- same atomic-constraint pattern as
-- payments_one_pending_per_booking (036) for manual submissions. A
-- failed/verified/requires_review row no longer holds this slot, so a
-- retry after failure can freely create a new 'initiated' row.
create unique index payments_one_active_chapa_per_booking
  on public.payments (booking_id)
  where (payment_method = 'chapa' and payment_status = 'initiated');

-- tx_ref must never be reused for a second Chapa initialization (spec
-- section 5) -- enforced atomically, not just by generate_chapa_tx_ref()'s
-- own retry loop.
create unique index payments_provider_tx_ref_unique
  on public.payments (provider_tx_ref)
  where (provider_tx_ref is not null);

create index payments_payment_method_idx on public.payments (payment_method);

-- =========================================================================
-- Policy constant -- how long a booking's slot stays reserved once a
-- Chapa transaction has been successfully initialized (spec sections
-- 29-31). Chapa checkout can reasonably take longer than the original
-- short Phase 5 hold; 30 minutes is a deliberately finite V1 default --
-- never indefinite, no cron needed (same no-cron, hold_expires_at-driven
-- lazy-expiry design as every other hold in this codebase).
-- =========================================================================

create or replace function public.chapa_checkout_hold_minutes()
returns int
language sql
immutable
set search_path = public
as $$ select 30; $$;

revoke execute on function public.chapa_checkout_hold_minutes() from public, anon, authenticated;

-- =========================================================================
-- generate_chapa_tx_ref() -- internal only. Mirrors
-- generate_booking_reference()'s exact pattern (034), scoped to
-- payments.provider_tx_ref instead of bookings.booking_reference.
-- =========================================================================

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

-- =========================================================================
-- create_chapa_payment_attempt() -- the only way a payment_method='chapa'
-- row is created. authenticated only. Does NOT call Chapa itself (SQL
-- cannot make HTTP calls) -- the caller (a Next.js Server Action) uses the
-- returned provider_tx_ref/expected_amount/currency to initialize the
-- transaction with Chapa's API immediately afterward, so a local record
-- exists even if the customer closes their browser before that HTTP call
-- resolves (spec section 13).
-- =========================================================================
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
      v_booking.base_price, v_booking.base_price, v_booking.currency,
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
  -- 29-30) -- same hold_expires_at column every other hold in this
  -- codebase already uses, so get_bookable_slots()/the exclusion
  -- constraints need zero changes to respect it.
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

-- =========================================================================
-- mark_own_chapa_payment_failed() -- customer-owned, narrow. Used only
-- when the Chapa HTTP initialize call itself fails (network error, Chapa
-- API error) after create_chapa_payment_attempt() already created the
-- local row (spec section 14) -- flips that one row to 'failed' so the
-- partial unique index no longer blocks a retry, without ever touching a
-- row that isn't the caller's own or isn't still 'initiated'.
-- =========================================================================
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

-- =========================================================================
-- finalize_chapa_payment() -- service_role ONLY. The sole path that can
-- write payment_status = 'verified' for a Chapa row or confirm its
-- booking. Called exclusively from server-side code (the Chapa return
-- route and the Chapa webhook route, both running with
-- SUPABASE_SERVICE_ROLE_KEY, never exposed to the browser) AFTER that
-- code has independently called Chapa's own Verify Transaction API --
-- the caller's p_verified_* arguments must already be facts Chapa itself
-- returned, never values read from an untrusted webhook/callback payload
-- (spec sections 17, 21, 22, 55).
--
-- Idempotent (spec sections 34, 69): a payment already in a terminal
-- state (verified/failed/requires_review) short-circuits and returns
-- that same state without re-applying anything -- the same successful
-- webhook delivered 1 or 10 times produces exactly one state transition.
-- Safe under a callback/webhook race (spec sections 35, 70): `for update`
-- row locking on the payment serializes two concurrent calls for the
-- same tx_ref, so the second one to acquire the lock always sees the
-- first one's already-terminal result.
--
-- Late-success handling (spec sections 32, 33, 73): a genuinely
-- successful, amount/currency-matched payment whose booking is no longer
-- safely confirmable (already expired/released/resolved another way) is
-- never silently confirmed and never silently discarded -- it moves to
-- 'requires_review' with verified_at set, so admin can see Chapa
-- genuinely took the customer's money and investigate, without this
-- function ever creating a double booking by itself.
-- =========================================================================
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
  -- overpayment/underpayment tolerance in Phase 8.
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

comment on function public.finalize_chapa_payment(text, text, numeric, text, text, text) is
  'service_role ONLY -- never granted to anon/authenticated. The sole path to payment_status=verified for a Chapa row or booking_status=confirmed from one. Callers must pass p_verified_* facts obtained from Chapa''s own Verify Transaction API, never an untrusted webhook/callback payload directly. Idempotent and race-safe via FOR UPDATE row locking; a payment whose booking is no longer safely confirmable moves to requires_review instead of confirming or silently failing.';

revoke execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.finalize_chapa_payment(text, text, numeric, text, text, text) to service_role;
