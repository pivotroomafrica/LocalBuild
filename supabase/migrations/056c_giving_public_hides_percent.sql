-- The pledge percentage is private: clients see only which NGO an expert
-- supports. Admins still see the percentage (expert_profiles under RLS).
drop function if exists public.get_expert_giving_public(text);

create function public.get_expert_giving_public(p_slug text default null)
returns table (slug text, ngo_name text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select ep.slug, n.name
  from public.expert_profiles ep
  join public.ngos n on n.id = ep.supported_ngo_id and n.is_active
  where ep.profile_status = 'published'
    and ep.donation_percent is not null
    and (p_slug is null or ep.slug = p_slug);
$$;

revoke execute on function public.get_expert_giving_public(text) from public;
grant execute on function public.get_expert_giving_public(text) to anon, authenticated;
