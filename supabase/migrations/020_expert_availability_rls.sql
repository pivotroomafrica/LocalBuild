-- 020_expert_availability_rls.sql
-- Phase 4: Row Level Security for the three availability tables added in
-- 019_expert_availability_tables.sql. Migrations 001-019 are not
-- modified.
--
-- Read access: the owning expert (only while their application is
-- approved, spec section 26) and admins (read-only, spec section 27) --
-- no write policy is granted to `authenticated` on any of these three
-- tables at all. Every write goes through the SECURITY DEFINER RPCs in
-- 021_expert_availability_functions.sql, which resolve the caller's own
-- approved expert_profile_id server-side and never trust a client-
-- supplied id (spec sections 26, 31, 33). This is a stricter version of
-- the column-grant pattern used elsewhere in this codebase (e.g.
-- 010_expert_rls.sql): instead of granting broad column access and
-- relying on a trigger to restrict which VALUES are reachable, here there
-- is no direct write grant at all, because the correctness of a whole-
-- schedule replace depends on multi-row atomicity that a single-row
-- RLS policy cannot express.
--
-- No anon policy exists on any of these three tables (spec section 28) --
-- RLS enabled with zero anon-scoped policies is default-deny, so anon has
-- zero access without an explicit "using (false)" policy needed.
--
-- Supabase grants INSERT/UPDATE/DELETE on every new table to
-- authenticated/anon by default -- REVOKE must run before the narrower
-- GRANT (SELECT only), same load-bearing ordering as every RLS migration
-- before this one.

-- =========================================================================
-- expert_availability_settings
-- =========================================================================

create policy "expert_availability_settings_select_own"
  on public.expert_availability_settings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_availability_settings.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );

create policy "expert_availability_settings_select_admin"
  on public.expert_availability_settings
  for select
  to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.expert_availability_settings from authenticated;
grant select on public.expert_availability_settings to authenticated;

-- =========================================================================
-- expert_availability_windows
-- =========================================================================

create policy "expert_availability_windows_select_own"
  on public.expert_availability_windows
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_availability_windows.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );

create policy "expert_availability_windows_select_admin"
  on public.expert_availability_windows
  for select
  to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.expert_availability_windows from authenticated;
grant select on public.expert_availability_windows to authenticated;

-- =========================================================================
-- expert_unavailable_dates
-- =========================================================================

create policy "expert_unavailable_dates_select_own"
  on public.expert_unavailable_dates
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_unavailable_dates.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );

create policy "expert_unavailable_dates_select_admin"
  on public.expert_unavailable_dates
  for select
  to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.expert_unavailable_dates from authenticated;
grant select on public.expert_unavailable_dates to authenticated;
