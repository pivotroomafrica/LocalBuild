-- 036_payments.sql
-- Phase 6: manual bank-transfer payment. Migrations 001-035 are not
-- modified.
--
-- Generic "payments" table, not "manual_payments" -- a future Chapa
-- integration (Phase 7) should be able to add rows to this same table
-- rather than needing a parallel one, per spec section 54. Phase 6 only
-- ever writes payment_method = 'manual'; 'chapa' is intentionally not in
-- the CHECK constraint yet (adding an allowed value is a one-line future
-- migration -- no need to widen the constraint before anything can write
-- it). payment_status's CHECK constraint DOES already include the wider
-- future vocabulary ('initiated'/'paid'/'failed'/'refunded'), the same
-- pattern bookings.booking_status used in Phase 5 for 'confirmed'/
-- 'completed'/'cancelled' -- so a future phase can start writing those
-- values without a schema migration, even though no Phase 6 function
-- ever writes them.
--
-- One booking may have MULTIPLE payment rows over time (a rejected
-- attempt followed by a resubmission) -- payment history is never
-- overwritten, only appended to (spec section 26). Exactly one row per
-- booking may be 'pending_verification' at a time, enforced below by a
-- partial unique index, not application logic alone.

create table public.payments (
  id uuid primary key default gen_random_uuid(),

  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- Snapshot, resolved from auth.uid() at submission time by
  -- submit_manual_payment() (038) -- never trusted from client input.
  customer_id uuid not null references public.profiles (id) on delete cascade,

  payment_method text not null default 'manual' check (payment_method in ('manual')),

  -- Server-authoritative snapshot of bookings.base_price at submission
  -- time (spec section 6, 31) -- never accepted from the client, and
  -- never recalculated later even if the booking's underlying session
  -- price changes.
  expected_amount numeric(12, 2) not null check (expected_amount > 0),
  -- What the customer says they actually transferred. Stored separately
  -- from expected_amount so a mismatch is visible to admin, never
  -- auto-reconciled (spec section 9, 46).
  amount_paid numeric(12, 2) not null check (amount_paid > 0),
  currency text not null default 'ETB',

  bank_used text not null check (char_length(trim(bank_used)) between 1 and 150),
  -- No bank-specific format enforced (spec section 8) -- some banks
  -- produce references that aren't globally unique, so this is
  -- intentionally NOT a unique column; duplicates are flagged to admin
  -- at the application layer instead (spec section 18).
  transaction_reference text not null check (char_length(trim(transaction_reference)) between 1 and 200),

  -- Storage path only (manual-payment-receipts bucket, 037's RLS)
  -- -- never a public URL. Optional: a customer may submit without a
  -- receipt (spec section 10).
  receipt_path text,

  payment_status text not null default 'pending_verification'
    check (payment_status in (
      'pending_verification', 'verified', 'rejected',
      'initiated', 'paid', 'failed', 'refunded'
    )),

  -- Required whenever payment_status = 'rejected' -- same pattern as
  -- expert_profiles.review_message (012_expert_review_fields.sql):
  -- database-level backstop, independent of server-action validation.
  rejection_reason text,

  submitted_at timestamptz not null default now(),
  -- "The terminal admin decision moment" -- set by BOTH
  -- verify_manual_payment() and reject_manual_payment() (038), not
  -- verification-only despite the name (spec section 12 gives exactly
  -- this one audit-timestamp pair, not a separate rejected_at/by).
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_rejection_reason_required check (
    payment_status <> 'rejected'
    or (rejection_reason is not null and char_length(trim(rejection_reason)) > 0)
  )
);

comment on table public.payments is
  'One row per manual-payment submission attempt against a booking. Multiple rows may exist per booking over time (rejection + resubmission) -- history is never overwritten. The only write path in is submit_manual_payment()/verify_manual_payment()/reject_manual_payment() (038_payment_functions.sql).';

-- At most one ACTIVE (pending_verification) payment per booking at a
-- time (spec sections 12, 27) -- enforced atomically at the database
-- level, not by application-layer double-submit checks alone. A second
-- concurrent submission for the same booking hits this and is handled
-- idempotently by submit_manual_payment() (returns the existing pending
-- payment instead of erroring).
create unique index payments_one_pending_per_booking
  on public.payments (booking_id)
  where (payment_status = 'pending_verification');

-- General lookup indexes (spec section 44) -- not over-indexed.
create index payments_booking_id_idx on public.payments (booking_id);
create index payments_customer_id_idx on public.payments (customer_id);
create index payments_status_idx on public.payments (payment_status);
create index payments_submitted_at_idx on public.payments (submitted_at);

alter table public.payments enable row level security;
-- Policies live in 037_payments_rls.sql.

create trigger set_payments_updated_at
  before update on public.payments
  for each row
  execute function public.set_updated_at();

-- =========================================================================
-- Storage: manual-payment-receipts bucket
-- =========================================================================
-- Private (public = false) -- a bank-transfer receipt is sensitive
-- financial evidence (spec section 28); never a public URL, only signed
-- URLs generated server-side for the owning customer or an admin.
-- Object key convention: "<customer_id>/<booking_id>/<random>-<name>" --
-- one file per submission attempt (not a fixed upsert-on-write path like
-- expert-profile-images), so a rejected attempt's receipt is preserved
-- as evidence even after the customer uploads a new one for a
-- resubmission (spec section 43).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'manual-payment-receipts',
  'manual-payment-receipts',
  false,
  5242880, -- 5 MB hard cap enforced by Storage itself
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Storage RLS policies live in 037_payments_rls.sql, alongside the rest
-- of Phase 6's access control.
