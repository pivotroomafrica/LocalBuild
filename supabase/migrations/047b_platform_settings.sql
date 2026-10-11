-- 047b_platform_settings.sql (047a-047d together)
--
-- Pivotroom V2 -- business rules approved by the product owner (2026-10-10):
--
--   * VAT 15% is ADDED to the expert's price. The VAT-inclusive amount is
--     what the customer pays and what is shown as the main price.
--   * Pivotroom's 20% commission is INCLUDED in the expert's price (not
--     added on top): commission = 20% of the expert's price, and the
--     expert's payout is the remaining 80%. VAT is never part of the
--     commission base.
--   * Payments whose total is above 300,000 ETB are verified manually:
--     Chapa checkout is refused and the customer pays by bank transfer,
--     which an admin always verifies.
--   * Logged-out visitors may read the active expert categories (public
--     taxonomy already shown on published profiles).
--
-- Worked example, expert price 2,500.00 ETB:
--   VAT 375.00 -> customer pays 2,875.00; commission 500.00; payout 2,000.00.
--
-- Non-destructive: adds one table, six nullable booking columns, two
-- triggers, one policy role, and re-creates two payment functions with
-- the charged amount switched from base_price to total_price. Existing
-- bookings keep their original price (the new columns stay NULL, and
-- every reader falls back to base_price), so nobody is re-priced.

-- Applied as four separate migrations (047a-047d) because the hosted
-- migration tool cancels any statement batch containing DROP, even the
-- re-run guards; these objects were all new, so no guards are needed.

-- 1. Rates live in one row, not in code ------------------------------------

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),  -- singleton
  vat_rate numeric(5, 4) not null default 0.15 check (vat_rate >= 0 and vat_rate < 1),
  commission_rate numeric(5, 4) not null default 0.20 check (commission_rate >= 0 and commission_rate < 1),
  manual_verification_threshold numeric(12, 2) not null default 300000 check (manual_verification_threshold > 0),
  currency text not null default 'ETB',
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Public, non-sensitive: the site needs the VAT rate to show prices.
-- No insert/update/delete policies: rates change only via SQL by an
-- operator, never from the app.
create policy platform_settings_select_all on public.platform_settings
  for select to anon, authenticated using (true);

grant select on public.platform_settings to anon, authenticated;

comment on table public.platform_settings is
  'Single-row platform pricing configuration (VAT, commission, manual-verification threshold). Snapshotted onto each booking at creation.';
