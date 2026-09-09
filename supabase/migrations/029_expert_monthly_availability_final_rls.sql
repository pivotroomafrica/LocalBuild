-- 029_expert_monthly_availability_final_rls.sql
-- Phase 4 final adjustment: Row Level Security for the two tables added in
-- 028_expert_monthly_availability_final_tables.sql. Migrations 001-028 are
-- not modified. Identical pattern to every prior availability RLS
-- migration (020, 024): the owning expert may SELECT their own rows only
-- while expert_profiles.application_status = 'approved'; admins may
-- SELECT any expert's rows (read-only); no INSERT/UPDATE/DELETE grant
-- exists for `authenticated` at all -- every write goes through the
-- SECURITY DEFINER RPCs in 030_expert_monthly_availability_final_functions.sql,
-- which resolve the caller's own approved expert_profile_id server-side
-- and never trust a client-supplied one. No anon policy exists on either
-- table -- RLS enabled with zero anon-scoped policies is default-deny.

-- =========================================================================
-- expert_monthly_availability_rules
-- =========================================================================

create policy "expert_monthly_availability_rules_select_own"
  on public.expert_monthly_availability_rules
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_monthly_availability_rules.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );

create policy "expert_monthly_availability_rules_select_admin"
  on public.expert_monthly_availability_rules
  for select
  to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.expert_monthly_availability_rules from authenticated;
grant select on public.expert_monthly_availability_rules to authenticated;

-- =========================================================================
-- expert_availability_overrides
-- =========================================================================

create policy "expert_availability_overrides_select_own"
  on public.expert_availability_overrides
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_availability_overrides.expert_profile_id
        and ep.user_id = (select auth.uid())
        and ep.application_status = 'approved'
    )
  );

create policy "expert_availability_overrides_select_admin"
  on public.expert_availability_overrides
  for select
  to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.expert_availability_overrides from authenticated;
grant select on public.expert_availability_overrides to authenticated;
