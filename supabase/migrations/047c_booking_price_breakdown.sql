-- 047c: per-booking VAT/commission/payout snapshot. See 047b for the rules.

-- 2. Per-booking price breakdown (snapshotted, exact numeric) --------------

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

-- A booking's money never changes after creation (reschedules move the
-- time, not the price). Silently keep the original values.
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
