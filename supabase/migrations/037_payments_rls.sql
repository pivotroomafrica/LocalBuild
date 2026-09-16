-- 037_payments_rls.sql
-- Phase 6: Row Level Security for payments (036_payments.sql) and Storage
-- policies for the manual-payment-receipts bucket. Migrations 001-036 are
-- not modified.
--
-- Same three-layer model as every table since Phase 4: RLS scopes rows to
-- their owner (or admin); REVOKE/GRANT controls which operations are even
-- reachable at all; every actual write goes through the SECURITY DEFINER
-- functions in 038_payment_functions.sql, never a direct INSERT/UPDATE
-- from the client (spec section 58: "Customer should NOT have arbitrary
-- direct UPDATE privileges").

revoke all on public.payments from anon, authenticated;

-- =========================================================================
-- payments
-- =========================================================================

create policy "payments_select_own"
  on public.payments
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "payments_select_admin"
  on public.payments
  for select
  to authenticated
  using (public.is_admin());

grant select on public.payments to authenticated;
-- No insert/update/delete grant to authenticated at all -- submission
-- goes through submit_manual_payment(), verification/rejection through
-- verify_manual_payment()/reject_manual_payment() (all 038, all
-- SECURITY DEFINER). anon: zero policies, zero grant -- default deny.

-- =========================================================================
-- Storage: manual-payment-receipts
-- =========================================================================
-- Same ownership pattern as expert-profile-images
-- (010_expert_rls.sql/018_expert_photo_admin_access.sql): the object
-- key's first folder segment is the owning customer's user_id. A
-- customer may read/write only their own receipts; an admin may read
-- every receipt (bucket-wide is_admin() check, same pattern as
-- expert_photo_select_admin -- an admin's review role covers every
-- customer, there is no narrower "reviewable" subset to join against).
-- No expert access (spec section 59) -- experts do not review payments.

create policy "payment_receipt_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'manual-payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "payment_receipt_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'manual-payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Allows replacing a receipt file before final submission (spec section
-- 43: "if customer replaces before submission, replace old file") --
-- each submission attempt still gets its own path from the server
-- action, so this only ever overwrites a file the same attempt already
-- staged, never a previously-submitted attempt's evidence.
create policy "payment_receipt_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'manual-payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'manual-payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "payment_receipt_select_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'manual-payment-receipts'
    and public.is_admin()
  );
