-- Admin "People" lists: every client and expert with their contact details.
-- Email lives in auth.users, so these are SECURITY DEFINER and refuse
-- anyone who is not an admin (is_admin(), migration 013).

create or replace function public.admin_people(p_kind text default 'clients')
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  country text,
  city text,
  role text,
  account_status text,
  created_at timestamptz,
  expert_profile_id uuid,
  application_status text,
  profile_status text,
  bookings_as_client bigint,
  bookings_as_expert bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.phone,
    coalesce(p.country, ep.country),
    coalesce(p.city, ep.city),
    p.role,
    p.account_status,
    p.created_at,
    ep.id,
    ep.application_status,
    ep.profile_status,
    (select count(*) from public.bookings b where b.customer_id = p.id),
    (select count(*) from public.bookings b where ep.id is not null and b.expert_profile_id = ep.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.expert_profiles ep on ep.user_id = p.id
  where case
    when p_kind = 'experts' then ep.id is not null
    -- A client is anyone who can book: not an admin, and either not an
    -- expert applicant beyond an unsent draft, or someone who has booked.
    when p_kind = 'clients' then p.role <> 'admin' and (
      ep.id is null
      or ep.application_status = 'draft'
      or exists (select 1 from public.bookings b where b.customer_id = p.id)
    )
    else true
  end
  order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_people(text) from public, anon;
grant execute on function public.admin_people(text) to authenticated;

create or replace function public.admin_person(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  phone text,
  country text,
  city text,
  role text,
  account_status text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  expert_profile_id uuid,
  expert_slug text,
  application_status text,
  profile_status text,
  expert_linkedin text,
  client_job_title text,
  company_name text,
  client_linkedin text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.phone,
    coalesce(p.country, ep.country),
    coalesce(p.city, ep.city),
    p.role,
    p.account_status,
    p.created_at,
    u.last_sign_in_at,
    ep.id,
    ep.slug,
    ep.application_status,
    ep.profile_status,
    ep.linkedin_url,
    cp."current_role",
    cp.company_name,
    cp.linkedin_url
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.expert_profiles ep on ep.user_id = p.id
  left join public.customer_profiles cp on cp.user_id = p.id
  where p.id = p_user_id;
end;
$$;

revoke execute on function public.admin_person(uuid) from public, anon;
grant execute on function public.admin_person(uuid) to authenticated;
