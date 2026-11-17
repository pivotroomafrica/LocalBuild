-- 066: Company logos on expert profiles.
--
-- Experts (after onboarding, from their profile page) and admins (any time,
-- for any expert) upload a logo per company the expert has worked at. The
-- public profile shows them next to the current role and each experience
-- row.
--
-- Storage: a PUBLIC bucket (logos are public brand marks shown on public
-- pages). Files live under '<expert user id>/...'. An expert writes only
-- their own folder; an admin writes any folder.
--
-- Data: expert_profiles.company_logos, { "<company key>": "<path in bucket>" }
-- where the key is the company name lower-cased and trimmed, so one logo
-- serves every row that names that company.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  1048576, -- 1 MB
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "company_logo_insert" on storage.objects;
create policy "company_logo_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

drop policy if exists "company_logo_update" on storage.objects;
create policy "company_logo_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'company-logos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  )
  with check (
    bucket_id = 'company-logos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

drop policy if exists "company_logo_delete" on storage.objects;
create policy "company_logo_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-logos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

-- Listing/reading through the API (public URLs need no policy).
drop policy if exists "company_logo_select" on storage.objects;
create policy "company_logo_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'company-logos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

alter table public.expert_profiles
  add column if not exists company_logos jsonb not null default '{}'::jsonb;

alter table public.expert_profiles drop constraint if exists expert_profiles_company_logos_object;
alter table public.expert_profiles
  add constraint expert_profiles_company_logos_object check (jsonb_typeof(company_logos) = 'object');

-- Experts edit their own row (existing RLS); admins any row (050 policies).
grant update (company_logos) on public.expert_profiles to authenticated;

-- Published experts' logos for the public profile.
create or replace function public.get_expert_company_logos_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select ep.company_logos
  from public.expert_profiles ep
  where ep.slug = p_slug and ep.profile_status = 'published';
$$;

revoke execute on function public.get_expert_company_logos_public(text) from public;
grant execute on function public.get_expert_company_logos_public(text) to anon, authenticated;
