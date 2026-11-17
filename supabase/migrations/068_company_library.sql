-- 068: Shared company logo library.
--
-- One logo per company, reused by every expert who worked there (instead
-- of each expert uploading their own copy). Experts and admins search the
-- library by name and pick a company; only a company that isn't there yet
-- gets a new upload, which then joins the library.
--
-- expert_profiles.company_logos (066) still maps the expert's own company
-- name to a logo path; for a library company that path is the library's.
-- Library files are shared, so the app never deletes a path that a library
-- row points to.
--
-- Writes: any signed-in user may ADD a company whose logo is in their own
-- folder (an admin, any folder). Only admins may change or remove a
-- library entry, so nobody can overwrite another expert's logo.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null,
  logo_path text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint companies_name_length check (char_length(trim(name)) between 1 and 160),
  constraint companies_logo_path_shape check (logo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$')
);

create unique index if not exists companies_name_key_unique on public.companies (name_key);
create index if not exists companies_name_key_trgm on public.companies (name_key text_pattern_ops);

alter table public.companies enable row level security;

drop policy if exists "companies_select_all" on public.companies;
create policy "companies_select_all" on public.companies
  for select to anon, authenticated using (true);

drop policy if exists "companies_insert_own_logo" on public.companies;
create policy "companies_insert_own_logo" on public.companies
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (split_part(logo_path, '/', 1) = (select auth.uid())::text or public.is_admin())
  );

drop policy if exists "companies_update_admin" on public.companies;
create policy "companies_update_admin" on public.companies
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "companies_delete_admin" on public.companies;
create policy "companies_delete_admin" on public.companies
  for delete to authenticated using (public.is_admin());

revoke all on public.companies from anon, authenticated;
grant select on public.companies to anon, authenticated;
grant insert (name, name_key, logo_path, created_by) on public.companies to authenticated;
grant update (name, name_key, logo_path) on public.companies to authenticated;
grant delete on public.companies to authenticated;
