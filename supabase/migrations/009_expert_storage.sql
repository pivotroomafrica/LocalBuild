-- 009_expert_storage.sql
-- Dedicated Storage bucket for expert profile photos. Separate from any
-- future customer image storage. Private (public = false): experts are
-- not public yet in Phase 2, so nothing here should be fetchable without
-- an authenticated, authorized request.
--
-- Object key convention: "<user_id>/profile-photo" (no extension). A
-- fixed path with upsert-on-write means re-uploading a new photo
-- overwrites the same object instead of accumulating old files, and the
-- browser renders images from the response's Content-Type header, not
-- the URL, so an extension-less key works fine.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expert-profile-images',
  'expert-profile-images',
  false,
  3145728, -- 3 MB hard cap enforced by Storage itself, independent of app-level checks
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Ownership policies live in 010_expert_rls.sql, alongside the rest of
-- Phase 2's RLS, so all of Phase 2's access control is reviewable in one
-- place.
