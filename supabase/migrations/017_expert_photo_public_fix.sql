-- 017_expert_photo_public_fix.sql
-- Fixes a gap found by live testing of 016_public_expert_views.sql's
-- storage policy (migrations 001-016 are otherwise unmodified).
--
-- expert_photo_select_published's USING clause ran a subquery directly
-- against public.expert_profiles:
--   exists (select 1 from public.expert_profiles ep where ...)
-- Row Level Security policies are evaluated AS THE QUERYING ROLE -- a
-- subquery inside a policy is not exempt from RLS on the table it reads,
-- so that EXISTS was itself subject to expert_profiles' own RLS. anon has
-- no SELECT policy on expert_profiles at all (only `authenticated`-scoped
-- owner/admin policies exist, from 010_expert_rls.sql /
-- 013_admin_authorization.sql), so for an anon caller the subquery always
-- saw zero rows -- live-tested and confirmed: even a genuinely published
-- expert's photo object was invisible to anon, count(*) = 0.
--
-- Not a data leak (the failure mode was "even public photos stayed
-- hidden," the opposite direction of a leak) -- but it defeats the whole
-- point of 016's storage policy, so it is fixed here rather than left as
-- a known issue.
--
-- Fix: the same SECURITY DEFINER pattern already used for is_admin() --
-- move the published-photo check into a SECURITY DEFINER function, which
-- runs with the function owner's privileges and so bypasses RLS on
-- expert_profiles for this one, narrowly-scoped, read-only check.

create or replace function public.is_published_expert_photo(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.expert_profiles ep
    where ep.profile_image_path = object_name
      and ep.profile_status = 'published'
  );
$$;

revoke execute on function public.is_published_expert_photo(text) from public;
grant execute on function public.is_published_expert_photo(text) to anon, authenticated;

drop policy "expert_photo_select_published" on storage.objects;

create policy "expert_photo_select_published"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'expert-profile-images'
    and public.is_published_expert_photo(storage.objects.name)
  );
