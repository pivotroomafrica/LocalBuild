-- 033_bookings_rls.sql
-- Phase 5: Row Level Security for bookings/booking_intake
-- (032_bookings.sql). Migrations 001-032 are not modified.
--
-- New tables in this project pick up full default CRUD grants to `anon`
-- and `authenticated` (confirmed live before writing this migration --
-- the same discovery already documented for other Phase 4/5 tables) --
-- RLS alone is not the only layer needed; the REVOKE below is what
-- actually closes that gap, same pattern as every other table in this
-- codebase.
--
-- Same three-layer model used everywhere else: RLS scopes rows to their
-- owner (or admin); REVOKE/GRANT controls which operations are even
-- reachable at all; every actual write goes through the SECURITY
-- DEFINER functions in 034_booking_functions.sql, never a direct
-- INSERT/UPDATE/DELETE from the client (spec section 61: "Customer
-- should NOT have broad direct UPDATE access to critical booking
-- fields" -- so there is no UPDATE grant for the customer to have narrow
-- access to in the first place).

revoke all on public.bookings from anon, authenticated;
revoke all on public.booking_intake from anon, authenticated;

-- =========================================================================
-- bookings
-- =========================================================================

create policy "bookings_select_own"
  on public.bookings
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "bookings_select_admin"
  on public.bookings
  for select
  to authenticated
  using (public.is_admin());

grant select on public.bookings to authenticated;
-- No insert/update/delete grant to authenticated at all -- every write
-- goes through create_booking_hold() / advance_booking_to_awaiting_
-- payment() (both SECURITY DEFINER, 034), which resolve the caller's own
-- customer_id from auth.uid() and never accept one as a parameter.
-- anon: zero policies, zero grant -- default deny.

-- =========================================================================
-- booking_intake
-- =========================================================================
-- Spec section 62: a customer may read intake only where the owning
-- booking's customer_id is their own. No expert access in Phase 5 --
-- sessions are never confirmed yet, so there is no expert-facing intake
-- read path to build.

create policy "booking_intake_select_own"
  on public.booking_intake
  for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_intake.booking_id
        and b.customer_id = (select auth.uid())
    )
  );

create policy "booking_intake_select_admin"
  on public.booking_intake
  for select
  to authenticated
  using (public.is_admin());

grant select on public.booking_intake to authenticated;
-- No insert/update/delete grant -- the only write path is
-- save_booking_intake() (034), which re-derives ownership from auth.uid()
-- and the target booking's customer_id, never from a client-supplied id.
