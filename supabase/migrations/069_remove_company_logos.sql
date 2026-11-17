-- 069: Remove the company logos feature (066, 068).
--
-- The feature was taken out of the app before launch; nothing was ever
-- uploaded (0 files, 0 library rows, 0 profiles with logos when removed).

drop function if exists public.get_expert_company_logos_public(text);

drop table if exists public.companies;

alter table public.expert_profiles drop constraint if exists expert_profiles_company_logos_object;
alter table public.expert_profiles drop column if exists company_logos;

drop policy if exists "company_logo_insert" on storage.objects;
drop policy if exists "company_logo_update" on storage.objects;
drop policy if exists "company_logo_delete" on storage.objects;
drop policy if exists "company_logo_select" on storage.objects;

-- The bucket is empty. Supabase may block deleting it from SQL; without
-- the policies above nobody can upload to it anyway.
do $$
begin
  delete from storage.buckets
  where id = 'company-logos'
    and not exists (select 1 from storage.objects where bucket_id = 'company-logos');
exception when others then
  raise notice 'company-logos bucket left in place: %', sqlerrm;
end $$;
