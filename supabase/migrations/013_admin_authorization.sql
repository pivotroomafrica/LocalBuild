-- 013_admin_authorization.sql
-- Phase 3: admin authorization. Purely additive on top of expert_profiles /
-- profiles (001_profiles.sql, 005_expert_profiles.sql, 010_expert_rls.sql) --
-- migrations 001-012 are not modified.
--
-- There is no separate Postgres role for "admin" -- every logged-in user
-- authenticates as the same `authenticated` Postgres role, and admin-ness
-- is purely data-driven (profiles.role = 'admin', a value the 'admin'
-- check constraint already allowed since 001_profiles.sql, but that
-- nothing has ever granted). This migration adds:
--
--   1. is_admin(): a SECURITY DEFINER helper so RLS policies and the
--      review trigger can check the CALLER's own profiles.role without
--      being subject to (or recursing through) RLS on profiles itself.
--   2. New RLS SELECT/UPDATE policies (additive -- the existing
--      owner-only policies from 010_expert_rls.sql are untouched) that
--      extend expert_profiles/expert_profile_categories/
--      expert_session_types read access, and expert_profiles write
--      access, to admins.
--   3. Column grants for the 7 new review/audit columns from
--      012_expert_review_fields.sql -- granted broadly to `authenticated`
--      (Postgres column grants are not per-user), with the actual
--      value-level restriction to admin-only enforced by the rewritten
--      trigger below, exactly the same defense-in-depth split already
--      used for application_status/profile_status since 010_expert_rls.sql.
--   4. A rewritten protect_expert_profile_privileged_fields() that adds an
--      admin branch (the small, explicit review + publication state
--      machine from the Phase 3 spec) alongside the existing,
--      byte-for-byte-preserved applicant branch -- extended by exactly one
--      transition: changes_requested -> submitted, for resubmission.
--   5. A CHECK constraint requiring a non-empty review_message whenever
--      application_status is changes_requested or rejected -- a
--      database-level backstop for "Request Changes / Reject require a
--      message", independent of server-action validation.
--
-- profiles.role is NEVER written by anything in this migration. Admin
-- authorization reads profiles.role; it never sets it. Promoting a user to
-- admin remains a manual, out-of-band operation (Supabase dashboard /
-- direct SQL as the project owner) -- there is deliberately no self-service
-- or API path to become an admin anywhere in this codebase.

-- =========================================================================
-- is_admin()
-- =========================================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- =========================================================================
-- profiles: admin read access (identity for the admin application-review
-- view). No admin UPDATE policy is added here or anywhere else in this
-- migration -- profiles.role/account_status stay reachable only via
-- protect_privileged_profile_fields()'s service_role check
-- (004_customer_rls.sql), unchanged.
-- =========================================================================

create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

-- =========================================================================
-- expert_profiles: admin read/write
-- =========================================================================

create policy "expert_profiles_select_admin"
  on public.expert_profiles
  for select
  to authenticated
  using (public.is_admin());

create policy "expert_profiles_update_admin"
  on public.expert_profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Broad column grant, same pattern as application_status/profile_status in
-- 010_expert_rls.sql: WHICH columns are writable at all vs. WHICH VALUE
-- TRANSITIONS are allowed are two separate layers. Only admins can ever
-- cause these columns to actually change value -- enforced below by the
-- trigger, not by this grant.
grant update (
  reviewed_at, reviewed_by, review_message,
  approved_at, approved_by, published_at, published_by
) on public.expert_profiles to authenticated;

-- Database-level backstop for "Request Changes / Reject require a
-- message" (Phase 3 spec sections 20, 22). Only inspects the NEW row, so
-- it holds regardless of caller.
alter table public.expert_profiles
  add constraint expert_review_message_required_check
    check (
      application_status not in ('changes_requested', 'rejected')
      or (review_message is not null and char_length(trim(review_message)) > 0)
    );

-- =========================================================================
-- expert_profile_categories / expert_session_types: admin read access
-- (the admin detail page needs to show an applicant's selected categories
-- and session pricing). Admins never write these -- only the applicant
-- does, via the existing owner-only policies from 010_expert_rls.sql.
-- =========================================================================

create policy "expert_profile_categories_select_admin"
  on public.expert_profile_categories
  for select
  to authenticated
  using (public.is_admin());

create policy "expert_session_types_select_admin"
  on public.expert_session_types
  for select
  to authenticated
  using (public.is_admin());

-- =========================================================================
-- protect_expert_profile_privileged_fields(): rewritten to add an admin
-- branch. The applicant branch is unchanged from 010_expert_rls.sql except
-- for one addition: changes_requested -> submitted is now also a valid
-- self-service transition (resubmission after changes were requested),
-- alongside the original draft -> submitted.
-- =========================================================================

create or replace function public.protect_expert_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Never client-writable by anyone, admin included: ownership of an
  -- expert_profiles row never moves.
  new.user_id := old.user_id;

  if public.is_admin() then
    -- Admin-driven review + publication state machine. This is the
    -- database-level backstop that only these specific transitions are
    -- reachable at all; business validation (completeness before
    -- approval, a non-empty review message, etc.) lives in the server
    -- action layer on top of this.
    if old.application_status = 'submitted' and new.application_status = 'changes_requested' then
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
      new.profile_status := old.profile_status;
      new.approved_at := old.approved_at;
      new.approved_by := old.approved_by;
      new.published_at := old.published_at;
      new.published_by := old.published_by;

    elsif old.application_status = 'submitted' and new.application_status = 'rejected' then
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
      new.profile_status := old.profile_status;
      new.approved_at := old.approved_at;
      new.approved_by := old.approved_by;
      new.published_at := old.published_at;
      new.published_by := old.published_by;

    elsif old.application_status = 'submitted'
      and new.application_status = 'approved'
      and new.profile_status = 'ready' then
      -- Approval never auto-publishes: profile_status can only become
      -- 'ready' here, never 'published' (enforced by the check above --
      -- any other requested new.profile_status falls through to the
      -- catch-all `else` and is discarded).
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
      new.approved_at := now();
      new.approved_by := auth.uid();
      new.published_at := old.published_at;
      new.published_by := old.published_by;

    elsif old.application_status = 'approved' and new.application_status = 'approved' then
      -- Publication-only sub-state-machine. Deliberately gated on
      -- application_status = 'approved' on BOTH sides (not just
      -- profile_status = 'ready', which is ambiguous -- submission itself
      -- also sets profile_status = 'ready'): without this, a bare
      -- profile_status change could publish a merely-submitted,
      -- never-approved application.
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
      new.approved_at := old.approved_at;
      new.approved_by := old.approved_by;
      new.review_message := old.review_message;

      if old.profile_status = 'ready' and new.profile_status = 'published' then
        new.published_at := now();
        new.published_by := auth.uid();
      elsif old.profile_status = 'published' and new.profile_status = 'ready' then
        new.published_at := old.published_at;
        new.published_by := old.published_by;
      elsif old.profile_status in ('ready', 'published') and new.profile_status = 'suspended' then
        new.published_at := old.published_at;
        new.published_by := old.published_by;
      elsif old.profile_status = 'suspended' and new.profile_status = 'ready' then
        new.published_at := old.published_at;
        new.published_by := old.published_by;
      else
        new.profile_status := old.profile_status;
        new.published_at := old.published_at;
        new.published_by := old.published_by;
      end if;

    else
      -- Any other attempted combination (skipping states, acting from the
      -- wrong starting state, a stale concurrent request) is silently
      -- discarded back to the prior row -- the server action layer is
      -- responsible for turning this into a clear "no longer in the
      -- expected state" message by checking the affected row count.
      new.application_status := old.application_status;
      new.profile_status := old.profile_status;
      new.review_message := old.review_message;
      new.reviewed_at := old.reviewed_at;
      new.reviewed_by := old.reviewed_by;
      new.approved_at := old.approved_at;
      new.approved_by := old.approved_by;
      new.published_at := old.published_at;
      new.published_by := old.published_by;
    end if;

  else
    -- Applicant (non-admin, non-service-role): identical to
    -- 010_expert_rls.sql, plus resubmission after changes_requested.
    if old.application_status in ('draft', 'changes_requested') and new.application_status = 'submitted' then
      new.submitted_at := now();
    else
      new.application_status := old.application_status;
      new.submitted_at := old.submitted_at;
    end if;

    if new.profile_status not in ('draft', 'ready') then
      new.profile_status := old.profile_status;
    end if;

    -- Applicants can never touch review/audit fields, no matter what
    -- column grants exist.
    new.review_message := old.review_message;
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.published_at := old.published_at;
    new.published_by := old.published_by;
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_expert_profile_privileged_fields() from public, anon, authenticated;
