-- 010_expert_rls.sql
-- Row Level Security, column-level grants, and privileged-field
-- protection for every Phase 2 table, plus Storage policies for the
-- expert profile-photo bucket. Same three-layer approach as Phase 1
-- (supabase/migrations/004_customer_rls.sql): RLS controls which ROWS a
-- policy applies to, column GRANT/REVOKE controls which COLUMNS can be
-- written at all, and (for expert_profiles specifically) a trigger
-- controls which VALUE TRANSITIONS a client-issued update may make.
--
-- Load-bearing ordering note (learned the hard way in Phase 1): Supabase
-- grants INSERT/UPDATE/DELETE on every new table to authenticated/anon by
-- default. A table-level REVOKE of a privilege removes it everywhere,
-- including any column-level grants -- so REVOKE must always run BEFORE
-- the narrower column GRANT, never after.

-- =========================================================================
-- expert_profiles
-- =========================================================================

create policy "expert_profiles_select_own"
  on public.expert_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "expert_profiles_insert_own"
  on public.expert_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "expert_profiles_update_own"
  on public.expert_profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke insert, update, delete on public.expert_profiles from authenticated;
grant select on public.expert_profiles to authenticated;
grant insert (
  user_id, slug, headline, current_position, current_company,
  years_experience_range, short_bio, expertise_summary, problems_help_with,
  who_i_help, career_highlights, linkedin_url, country, city, profile_image_path
) on public.expert_profiles to authenticated;
-- application_status and profile_status ARE included here: the applicant
-- legitimately needs to move draft -> submitted, and draft/ready are
-- legitimate profile_status choices. WHICH values that transition may
-- take is enforced below by protect_expert_profile_privileged_fields(),
-- not by this grant -- Postgres column grants control column access, not
-- specific values. id, user_id, slug, submitted_at, created_at and
-- updated_at are intentionally excluded: never client-writable.
grant update (
  headline, current_position, current_company, years_experience_range,
  short_bio, expertise_summary, problems_help_with, who_i_help,
  career_highlights, linkedin_url, country, city, profile_image_path,
  application_status, profile_status
) on public.expert_profiles to authenticated;

-- Defense in depth / the actual value-level enforcement: the ONLY
-- self-service application_status transition is draft -> submitted
-- (which also stamps submitted_at); profile_status may only ever become
-- draft/ready for a non-service-role caller. Anything else a client
-- attempts (approved, rejected, published, suspended, re-submitting,
-- moving backwards) is silently discarded back to the prior value. A
-- future admin action (Phase 3), authenticated as service_role, is
-- unaffected by this trigger.
create or replace function public.protect_expert_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.user_id := old.user_id;

    if old.application_status = 'draft' and new.application_status = 'submitted' then
      new.submitted_at := now();
    else
      new.application_status := old.application_status;
      new.submitted_at := old.submitted_at;
    end if;

    if new.profile_status not in ('draft', 'ready') then
      new.profile_status := old.profile_status;
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_expert_profiles_privileged_fields
  before update on public.expert_profiles
  for each row
  execute function public.protect_expert_profile_privileged_fields();

revoke execute on function public.protect_expert_profile_privileged_fields() from public, anon, authenticated;

-- =========================================================================
-- expert_categories
-- =========================================================================

create policy "expert_categories_select_active"
  on public.expert_categories
  for select
  to authenticated
  using (is_active = true);

revoke insert, update, delete on public.expert_categories from authenticated;
grant select on public.expert_categories to authenticated;

-- =========================================================================
-- expert_profile_categories
-- =========================================================================

create policy "expert_profile_categories_select_own"
  on public.expert_profile_categories
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_profile_categories.expert_profile_id
        and ep.user_id = (select auth.uid())
    )
  );

create policy "expert_profile_categories_insert_own"
  on public.expert_profile_categories
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_profile_categories.expert_profile_id
        and ep.user_id = (select auth.uid())
    )
  );

create policy "expert_profile_categories_delete_own"
  on public.expert_profile_categories
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_profile_categories.expert_profile_id
        and ep.user_id = (select auth.uid())
    )
  );

-- No UPDATE policy/grant: category selections are added or removed, never
-- edited in place.
revoke insert, update, delete on public.expert_profile_categories from authenticated;
grant select, insert, delete on public.expert_profile_categories to authenticated;

-- =========================================================================
-- expert_session_types
-- =========================================================================

create policy "expert_session_types_select_own"
  on public.expert_session_types
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_session_types.expert_profile_id
        and ep.user_id = (select auth.uid())
    )
  );

create policy "expert_session_types_insert_own"
  on public.expert_session_types
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_session_types.expert_profile_id
        and ep.user_id = (select auth.uid())
    )
  );

create policy "expert_session_types_update_own"
  on public.expert_session_types
  for update
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_session_types.expert_profile_id
        and ep.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_session_types.expert_profile_id
        and ep.user_id = (select auth.uid())
    )
  );

create policy "expert_session_types_delete_own"
  on public.expert_session_types
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.expert_profiles ep
      where ep.id = expert_session_types.expert_profile_id
        and ep.user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.expert_session_types from authenticated;
grant select, delete on public.expert_session_types to authenticated;
grant insert (
  expert_profile_id, duration_minutes, base_price, currency,
  online_enabled, in_person_enabled, is_active
) on public.expert_session_types to authenticated;
-- expert_profile_id excluded from UPDATE: an offering's owner never
-- legitimately needs to reassign it to a different expert_profile_id (a
-- user has at most one expert_profiles row anyway).
grant update (
  duration_minutes, base_price, currency,
  online_enabled, in_person_enabled, is_active
) on public.expert_session_types to authenticated;

-- =========================================================================
-- Storage: expert-profile-images bucket
-- =========================================================================
-- Object key convention: "<user_id>/profile-photo" -- ownership is read
-- directly from the path's first folder segment, the standard Supabase
-- Storage RLS pattern. RLS is already enabled on storage.objects by
-- Supabase itself; only policies are added here.

create policy "expert_photo_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'expert-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "expert_photo_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'expert-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "expert_photo_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'expert-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'expert-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "expert_photo_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'expert-profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
