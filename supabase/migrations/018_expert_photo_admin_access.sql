-- 018_expert_photo_admin_access.sql
-- Gap found while building the admin detail page (migrations 001-017 are
-- otherwise unmodified): neither existing storage.objects policy lets an
-- admin view a submitted (not yet published) applicant's profile photo.
-- expert_photo_select_own (010_expert_rls.sql) is owner-only;
-- expert_photo_select_published (016_public_expert_views.sql) only
-- matches published experts. The admin review page needs to show an
-- applicant's photo as part of "full application view" (Phase 3 spec
-- section 9) well before that expert is ever published.
--
-- Scoped to the whole bucket (not a per-row EXISTS join, unlike
-- expert_photo_select_published) because an admin's review role covers
-- every applicant regardless of status -- there is no narrower
-- "reviewable" subset to join against. Same pattern as
-- expert_profiles_select_admin (013_admin_authorization.sql): is_admin()
-- gates it, not row-by-row matching.

create policy "expert_photo_select_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'expert-profile-images'
    and public.is_admin()
  );
