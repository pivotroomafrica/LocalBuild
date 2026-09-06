-- 004_customer_rls.sql
-- Row Level Security policies for customer access, plus column-level
-- privilege restrictions that stop privileged fields (profiles.role,
-- profiles.account_status, customer_profiles.user_id) from being changed
-- through normal profile editing -- even if a request is crafted by hand
-- outside the UI.
--
-- RLS enforces WHICH ROWS a policy applies to. Column privileges enforce
-- WHICH COLUMNS can be written at all. A BEFORE UPDATE trigger is added as
-- a third, independent layer on profiles so privilege escalation is
-- blocked even if a future migration accidentally re-grants column access.

-- =========================================================================
-- profiles
-- =========================================================================

-- A customer may read their own profile only.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- A customer may update their own profile only. There is deliberately no
-- INSERT policy: rows are created exclusively by handle_new_user()
-- (SECURITY DEFINER, bypasses RLS), so a client can never insert an
-- arbitrary profiles row for itself or anyone else. There is no DELETE
-- policy either -- account deletion is out of scope for Phase 1.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Column-level privileges: authenticated users may read every column of
-- their own row (enforced above by the row policy) but may only WRITE the
-- personal-information columns. role and account_status are intentionally
-- left out of this grant.
grant select on public.profiles to authenticated;
grant update (full_name, phone, country, city) on public.profiles to authenticated;

-- Defense in depth: even if column grants are ever loosened, this trigger
-- silently discards any change to role/account_status that did not come
-- from the service role (used only by trusted server-side/admin code in
-- later phases). auth.role() is a Supabase helper that reads the calling
-- request's JWT role claim.
create or replace function public.protect_privileged_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.role := old.role;
    new.account_status := old.account_status;
  end if;
  return new;
end;
$$;

create trigger protect_profiles_privileged_fields
  before update on public.profiles
  for each row
  execute function public.protect_privileged_profile_fields();

revoke execute on function public.protect_privileged_profile_fields() from public, anon, authenticated;

-- =========================================================================
-- customer_profiles
-- =========================================================================

create policy "customer_profiles_select_own"
  on public.customer_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- A customer may create their OWN customer_profiles row (once -- the
-- unique constraint on user_id makes a second insert fail at the database
-- level, not just in the UI).
create policy "customer_profiles_insert_own"
  on public.customer_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "customer_profiles_update_own"
  on public.customer_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select on public.customer_profiles to authenticated;
-- user_id is excluded from both grants below: a customer can create their
-- own row (user_id is supplied once, checked by the INSERT policy above
-- against auth.uid()) but can never move an existing row to a different
-- owner.
grant insert (
  user_id, "current_role", employment_type, company_name,
  industry_id, years_experience_range, linkedin_url
) on public.customer_profiles to authenticated;
grant update (
  "current_role", employment_type, company_name,
  industry_id, years_experience_range, linkedin_url
) on public.customer_profiles to authenticated;

-- =========================================================================
-- industries
-- =========================================================================

-- Authenticated customers may read active industries only. There is no
-- INSERT/UPDATE/DELETE policy, so RLS denies all customer writes by
-- default -- industry management is an admin-only capability for a later
-- phase.
create policy "industries_select_active"
  on public.industries
  for select
  to authenticated
  using (is_active = true);

grant select on public.industries to authenticated;
