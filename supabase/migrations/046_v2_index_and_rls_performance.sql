-- 046_v2_index_and_rls_performance.sql
--
-- Pivotroom V2, Phase 2 -- performance-only, non-destructive.
-- Addresses the Supabase performance advisor findings of 2026-10-10:
--
-- 1. unindexed_foreign_keys (9): add a covering index for each foreign key
--    so joins / ON DELETE checks don't sequentially scan the child table.
--    IF NOT EXISTS keeps this safe to re-run.
--
-- 2. auth_rls_initplan (3): the *_select_own policies on
--    booking_reschedules / booking_cancellations / booking_change_requests
--    called auth.uid() and is_admin() once PER ROW. Wrapping them in
--    (select ...) lets Postgres evaluate them once per statement. The
--    access rule itself is unchanged: admin, the booking's customer, or
--    the booking's expert -- nothing else.
--
-- No columns, rows, grants or functions are added, changed or dropped.

-- 1. Foreign-key covering indexes ------------------------------------------

create index if not exists booking_cancellations_cancelled_by_user_id_idx
  on public.booking_cancellations (cancelled_by_user_id);

create index if not exists booking_change_requests_requested_by_idx
  on public.booking_change_requests (requested_by);

create index if not exists booking_reschedules_initiated_by_user_id_idx
  on public.booking_reschedules (initiated_by_user_id);

create index if not exists bookings_session_type_id_idx
  on public.bookings (session_type_id);

create index if not exists expert_profiles_approved_by_idx
  on public.expert_profiles (approved_by);

create index if not exists expert_profiles_published_by_idx
  on public.expert_profiles (published_by);

create index if not exists expert_profiles_reviewed_by_idx
  on public.expert_profiles (reviewed_by);

create index if not exists integration_jobs_payment_id_idx
  on public.integration_jobs (payment_id);

create index if not exists payments_verified_by_idx
  on public.payments (verified_by);

-- 2. Same policies, evaluated once per statement ----------------------------

alter policy booking_reschedules_select_own on public.booking_reschedules
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.bookings b
      where b.id = booking_reschedules.booking_id
        and (
          b.customer_id = (select auth.uid())
          or b.expert_profile_id in (
            select ep.id from public.expert_profiles ep where ep.user_id = (select auth.uid())
          )
        )
    )
  );

alter policy booking_cancellations_select_own on public.booking_cancellations
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.bookings b
      where b.id = booking_cancellations.booking_id
        and (
          b.customer_id = (select auth.uid())
          or b.expert_profile_id in (
            select ep.id from public.expert_profiles ep where ep.user_id = (select auth.uid())
          )
        )
    )
  );

alter policy booking_change_requests_select_own on public.booking_change_requests
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.bookings b
      where b.id = booking_change_requests.booking_id
        and (
          b.customer_id = (select auth.uid())
          or b.expert_profile_id in (
            select ep.id from public.expert_profiles ep where ep.user_id = (select auth.uid())
          )
        )
    )
  );
