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

-- A customer may read their own profile only. auth.uid() is wrapped in a
-- subselect so Postgres evaluates it once per query instead of once per
-- row (see the Supabase RLS performance guide) -- a plain query-plan
-- optimization, not a behavior change.
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- A customer may update their own profile only. There is deliberately no
-- INSERT policy: rows are created exclusively by handle_new_user()
-- (SECURITY DEFINER, bypasses RLS), so a client can never insert an
-- arbitrary profiles row for itself or anyone else. There is no DELETE
-- policy either -- account deletion is out of scope for Phase 1.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Column-level privileges: authenticated users may read every column of
-- their own row (enforced above by the row policy) but may only WRITE the
-- personal-information columns.
--
-- Supabase grants INSERT/UPDATE/DELETE on every table to authenticated/anon
-- by default (ALTER DEFAULT PRIVILEGES), so REVOKE must run BEFORE the
-- narrower column GRANT -- a table-level REVOKE of a privilege removes it
-- everywhere, including any column-level grants, so revoking afterward
-- would silently wipe out the columns we just re-granted. Order here is
-- load-bearing, not stylistic. protect_privileged_profile_fields() further
-- down is a second, independent layer in case a future migration re-grants
-- column access by accident.
revoke insert, update, delete on public.profiles from authenticated;
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
  using ((select auth.uid()) = user_id);

-- A customer may create their OWN customer_profiles row (once -- the
-- unique constraint on user_id makes a second insert fail at the database
-- level, not just in the UI).
create policy "customer_profiles_insert_own"
  on public.customer_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "customer_profiles_update_own"
  on public.customer_profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Same load-bearing ordering as profiles above: revoke the default
-- table-level grants first, then grant back only the specific columns.
-- user_id is excluded from the UPDATE grant: a customer can create their
-- own row (user_id is supplied once, checked by the INSERT policy above
-- against auth.uid()) but can never move an existing row to a different
-- owner.
revoke insert, update, delete on public.customer_profiles from authenticated;
grant select on public.customer_profiles to authenticated;
grant update (
  "current_role", employment_type, company_name,
  industry_id, years_experience_range, linkedin_url
) on public.customer_profiles to authenticated;
grant insert (
  user_id, "current_role", employment_type, company_name,
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

revoke insert, update, delete on public.industries from authenticated;
grant select on public.industries to authenticated;
