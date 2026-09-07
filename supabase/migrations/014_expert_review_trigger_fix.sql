-- 014_expert_review_trigger_fix.sql
-- Fixes a gap found by live testing of 013_admin_authorization.sql's
-- applicant branch (migrations 001-013 are otherwise unmodified; this is a
-- CREATE OR REPLACE of the same function, which is the normal way to
-- correct a function's logic without editing an already-applied
-- migration file).
--
-- The applicant (non-admin) branch reset profile_status back to
-- old.profile_status whenever the requested new.profile_status was
-- anything other than 'draft' or 'ready'. That rule made sense in
-- 010_expert_rls.sql, back when 'draft' and 'ready' were the only two
-- values an applicant's profile_status could ever hold. Since
-- 012_expert_review_fields.sql / 013_admin_authorization.sql,
-- profile_status can also be 'published' or 'suspended' (admin-controlled)
-- -- but the old rule still let an applicant whose profile is
-- 'published' (application_status = 'approved') set profile_status back
-- to 'draft' themselves, live-tested and confirmed: a plain
-- `update expert_profiles set profile_status = 'draft' ...` run as the
-- owning applicant succeeded and silently knocked an approved/published
-- profile out of the admin-managed publish state machine (draft is not
-- reachable from 'published' by any of the admin transitions in
-- protect_expert_profile_privileged_fields(), so this was a dead-end
-- state, not a public-visibility leak -- profile_status = 'draft' is
-- never selected by the public views -- but it violates "only admin
-- performs review decisions" / "adapt to existing schema, no parallel
-- duplicate state systems" from the Phase 3 spec, so it is fixed here
-- rather than left as a known issue).
--
-- Fix: an applicant may only move profile_status at all while
-- old.application_status is still in the pre-review phase (draft,
-- submitted, or changes_requested) -- exactly the same phase during which
-- draft -> submitted / changes_requested -> submitted are legal
-- application_status transitions for them. Once application_status is
-- 'approved' or 'rejected', profile_status becomes admin-only territory:
-- any applicant-issued change is discarded back to old, full stop.

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

  new.user_id := old.user_id;

  if public.is_admin() then
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
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
      new.approved_at := now();
      new.approved_by := auth.uid();
      new.published_at := old.published_at;
      new.published_by := old.published_by;

    elsif old.application_status = 'approved' and new.application_status = 'approved' then
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
    -- Applicant (non-admin, non-service-role).
    if old.application_status in ('draft', 'changes_requested') and new.application_status = 'submitted' then
      new.submitted_at := now();
    else
      new.application_status := old.application_status;
      new.submitted_at := old.submitted_at;
    end if;

    -- FIX (this migration): profile_status is only applicant-writable
    -- while the application itself is still in the pre-review phase.
    -- Once approved/rejected, profile_status is admin-only -- any
    -- applicant-issued change (including a well-formed 'draft' or
    -- 'ready') is discarded back to old.
    if old.application_status in ('draft', 'submitted', 'changes_requested')
       and new.profile_status in ('draft', 'ready') then
      null; -- allowed, value passes through as requested
    else
      new.profile_status := old.profile_status;
    end if;

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
