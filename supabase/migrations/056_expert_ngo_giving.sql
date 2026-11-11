-- Experts can pledge a share of their session earnings to an NGO.
-- ngos: the list experts choose from (admins add, rename and retire names).
-- expert_profiles.supported_ngo_id + donation_percent: the expert's pledge,
-- shown on the public profile with a gold verified mark.

create table if not exists public.ngos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint ngos_name_length check (char_length(trim(name)) between 2 and 160)
);

create unique index if not exists ngos_name_unique on public.ngos (lower(trim(name)));

alter table public.ngos enable row level security;

-- Anyone may read the active list (the expert picker); admins see all.
-- Two policies: anon cannot execute is_admin().
drop policy if exists "ngos_select_active" on public.ngos;
create policy "ngos_select_active" on public.ngos
  for select to anon
  using (is_active);

drop policy if exists "ngos_select_signed_in" on public.ngos;
create policy "ngos_select_signed_in" on public.ngos
  for select to authenticated
  using (is_active or public.is_admin());

drop policy if exists "ngos_insert_admin" on public.ngos;
create policy "ngos_insert_admin" on public.ngos
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "ngos_update_admin" on public.ngos;
create policy "ngos_update_admin" on public.ngos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ngos_delete_admin" on public.ngos;
create policy "ngos_delete_admin" on public.ngos
  for delete to authenticated
  using (public.is_admin());

alter table public.expert_profiles
  add column if not exists supported_ngo_id uuid references public.ngos (id) on delete set null,
  add column if not exists donation_percent smallint;

alter table public.expert_profiles drop constraint if exists expert_profiles_donation_percent_range;
alter table public.expert_profiles
  add constraint expert_profiles_donation_percent_range
  check (donation_percent is null or donation_percent between 1 and 100);

-- Pledges shown publicly: published experts whose NGO is still active.
create or replace function public.get_expert_giving_public(p_slug text default null)
returns table (slug text, ngo_name text, donation_percent smallint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select ep.slug, n.name, ep.donation_percent
  from public.expert_profiles ep
  join public.ngos n on n.id = ep.supported_ngo_id and n.is_active
  where ep.profile_status = 'published'
    and ep.donation_percent is not null
    and (p_slug is null or ep.slug = p_slug);
$$;

revoke execute on function public.get_expert_giving_public(text) from public;
grant execute on function public.get_expert_giving_public(text) to anon, authenticated;

-- Starting list: Ethiopian NGOs and charities. Admins can add more,
-- correct names or retire any from the admin NGO page.
insert into public.ngos (name) values
  ('Abebech Gobena Children''s Care and Development Organization'),
  ('AHOPE for Children Ethiopia'),
  ('Cheshire Services Ethiopia'),
  ('Emama Zewditu Meshesha Children and Family Charity'),
  ('Ethiopian Center for Disability and Development (ECDD)'),
  ('Ethiopian National Association of the Blind'),
  ('Ethiopian Red Cross Society'),
  ('Ethiopian Women Lawyers Association (EWLA)'),
  ('Fayyaa Integrated Development Organization'),
  ('Federation of Ethiopian National Associations of Persons with Disabilities (FENAPD)'),
  ('Gedeo Development Association'),
  ('Hamlin Fistula Ethiopia'),
  ('Health and Wholeness Ethiopia'),
  ('Hiwot Ethiopia'),
  ('Jerusalem Children and Community Development Organization (JeCCDO)'),
  ('Kembatti Mentti Gezzimma (KMG Ethiopia)'),
  ('Life Center Ethiopia'),
  ('Love for Children and Family Development Organization'),
  ('Mary Joy Development Association'),
  ('Mathiwos Wondu – YeEthiopia Cancer Society'),
  ('Mekedonia Humanitarian Association'),
  ('Mothers and Children Multisectoral Development Organization (MCMDO)'),
  ('Network of Ethiopian Women''s Associations (NEWA)'),
  ('Organization for Development of Women and Children in Ethiopia (ODWCE)'),
  ('Organization for Women in Self Employment (WISE)'),
  ('Positive Action for Development (PAD)'),
  ('Reach The Needy Ethiopia (RTN-Ethiopia)'),
  ('Selam Children''s Village'),
  ('Serve Ethiopia Development Association'),
  ('SHAPE Ethiopia'),
  ('Siiqqee Women''s Development Association'),
  ('SOS Children''s Villages Ethiopia'),
  ('Support for Children, Women and Older People (SCWOP)'),
  ('Trust Charitable Association'),
  ('Vision for Ethiopia Association'),
  ('Yezelalem Minch Children and Community Development (YMCCD)')
on conflict do nothing;
