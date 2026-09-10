-- 032_bookings.sql
-- Phase 5: the booking engine's two tables. Migrations 001-031 are not
-- modified.
--
-- Core principle (spec section 2): availability answers "when is the
-- expert willing to receive a booking" (Phase 4, untouched by this
-- migration); a booking answers "a customer has selected a specific
-- expert, duration, format, date and time." A booking is its own
-- transactional record -- it never rewrites an availability row, and an
-- availability edit never rewrites a booking row.
--
-- No pre-generated slot table exists here or anywhere in this migration
-- set (expert_slots / booking_slots / availability_slots / etc are
-- deliberately absent) -- bookable times are derived on demand by the
-- functions in 034_booking_functions.sql. Database growth is
-- proportional to real booking attempts, not to possible future slots.

-- =========================================================================
-- bookings
-- =========================================================================
-- A booking row represents BOTH a temporary reservation (booking_status
-- 'held'/'awaiting_payment' + hold_expires_at) and, in future phases, a
-- real appointment (booking_status 'confirmed') -- there is deliberately
-- no separate booking_holds table (spec section 92): a hold is just a
-- booking whose status hasn't advanced past 'held' yet.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),

  -- Human-readable, e.g. "PR-8F7K2A" -- generated server-side
  -- (generate_booking_reference(), 034). Customers are shown this, never
  -- asked to work with the raw UUID.
  booking_reference text not null unique,

  customer_id uuid not null references public.profiles (id) on delete cascade,
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,

  -- Nullable and ON DELETE SET NULL (spec section 35): the expert's
  -- current session-type configuration can change or a row can be
  -- removed later, but a historical booking must remain valid --
  -- duration_minutes/base_price/currency below are the actual snapshot
  -- this booking depends on, never a live join back to
  -- expert_session_types.
  session_type_id uuid references public.expert_session_types (id) on delete set null,

  duration_minutes integer not null check (duration_minutes in (15, 30, 45, 60, 90)),
  session_format text not null check (session_format in ('online', 'in_person')),

  -- Real-world instants, not local wall-clock recurrence (spec section
  -- 25) -- a booking is an actual appointment, unlike availability's
  -- local-time recurring rules.
  start_at timestamptz not null,
  end_at timestamptz not null,
  expert_timezone text not null,
  customer_timezone text,

  -- Price snapshot (spec section 5): copied from expert_session_types.
  -- base_price at hold-creation time and never recalculated from the
  -- expert's current rate afterward.
  base_price numeric(12, 2) not null check (base_price > 0),
  currency text not null default 'ETB',

  -- Small, deliberately not payment-shaped state machine (spec section
  -- 36) -- 'confirmed'/'completed'/'cancelled' are reachable values so a
  -- future payment phase can use them without a new migration, but no
  -- Phase 5 code path can ever reach them (034's functions only ever
  -- write 'held', 'awaiting_payment', or 'expired').
  booking_status text not null default 'held'
    check (booking_status in ('held', 'awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired')),

  -- Set for 'held'/'awaiting_payment', null once a booking leaves that
  -- window (expired/confirmed/etc). Source of truth for "is this hold
  -- still active" -- never the client's own countdown timer.
  hold_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bookings_valid_range check (end_at > start_at),
  -- end_at is always fully derived from start_at + duration -- the
  -- server never accepts a client-supplied end time (spec section 47).
  constraint bookings_valid_duration check (end_at = start_at + make_interval(mins => duration_minutes)),
  constraint bookings_hold_expiry_required check (
    (booking_status in ('held', 'awaiting_payment') and hold_expires_at is not null)
    or (booking_status not in ('held', 'awaiting_payment'))
  )
);

comment on table public.bookings is
  'A specific booking attempt: a real appointment (start_at/end_at in UTC) or, before that, a temporary hold on it. booking_status/hold_expires_at together represent the hold state machine -- see 034_booking_functions.sql for the only write path in.';

create index bookings_customer_id_idx on public.bookings (customer_id);
create index bookings_expert_profile_id_idx on public.bookings (expert_profile_id);
create index bookings_status_idx on public.bookings (booking_status);
create index bookings_start_at_idx on public.bookings (start_at);
-- booking_reference already has a unique index from the UNIQUE constraint.

alter table public.bookings enable row level security;
-- Policies live in 033_bookings_rls.sql.

create trigger set_bookings_updated_at
  before update on public.bookings
  for each row
  execute function public.set_updated_at();

-- Double-booking protection (spec sections 40-44): database-level, not
-- merely application-checked. btree_gist adds the operator class needed
-- to index a plain equality column (expert_profile_id / customer_id)
-- alongside a range-overlap operator in the same GiST exclusion
-- constraint.
create extension if not exists btree_gist with schema extensions;

-- No two ACTIVE (held/awaiting_payment/confirmed) bookings for the same
-- expert may occupy overlapping time. The predicate compares plain
-- column values only (no now()) -- see 034's create_booking_hold for why
-- that matters: a hold whose hold_expires_at has passed but whose
-- booking_status hasn't been flipped to 'expired' yet would still count
-- as active here, so the hold-creation function transitions stale rows
-- to 'expired' BEFORE inserting, and this constraint is the atomic
-- backstop against a genuine concurrent double-booking.
alter table public.bookings
  add constraint bookings_no_overlapping_expert_time
  exclude using gist (
    expert_profile_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (booking_status in ('held', 'awaiting_payment', 'confirmed'));

-- A customer may not hold/book overlapping time with a different expert
-- either (spec section 44).
alter table public.bookings
  add constraint bookings_no_overlapping_customer_time
  exclude using gist (
    customer_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (booking_status in ('held', 'awaiting_payment', 'confirmed'));

-- =========================================================================
-- booking_intake
-- =========================================================================
-- Booking-specific preparation questions (spec section 50) -- NOT part of
-- the permanent customer_profiles professional profile, and deliberately
-- not the retired "what are you trying to achieve" business-stage
-- question from any earlier draft of the product. One row per booking.
create table public.booking_intake (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,

  discussion_topic text not null,
  additional_context text not null,
  materials_to_review text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint booking_intake_discussion_topic_length check (char_length(discussion_topic) between 1 and 500),
  constraint booking_intake_additional_context_length check (char_length(additional_context) between 1 and 1500),
  constraint booking_intake_materials_length check (materials_to_review is null or char_length(materials_to_review) <= 1000)
);

comment on table public.booking_intake is
  'Booking-specific preparation questions for the expert -- not part of the permanent customer_profiles professional profile. One row per booking, upserted by save_booking_intake() (034).';

-- booking_id already has a unique index from the UNIQUE constraint, which
-- also serves as the lookup index for "load this booking's intake."

alter table public.booking_intake enable row level security;
-- Policies live in 033_bookings_rls.sql.

create trigger set_booking_intake_updated_at
  before update on public.booking_intake
  for each row
  execute function public.set_updated_at();
