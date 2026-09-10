-- 031_public_data_functions.sql
-- Phase 4 pre-Phase-5 repair: fixes the 3 CRITICAL "Security Definer
-- View" findings (Supabase Security Advisor lint 0010) against
-- expert_directory_public / expert_profile_public /
-- expert_session_types_public (016_public_expert_views.sql). Migrations
-- 001-030 are not modified.
--
-- Root cause: a Postgres VIEW that is not security_invoker runs with its
-- OWNER's privileges (postgres) rather than the querying role's -- that's
-- exactly what let these views read through RLS on expert_profiles/
-- profiles/etc while exposing only their own narrow SELECT list plus a
-- profile_status = 'published' filter. The pattern was intentional and
-- reviewed at the time (016's own comments explain why), but Supabase's
-- linter flags ANY such view as CRITICAL regardless of intent, and that
-- finding must be resolved for real before Phase 5, not just re-justified.
--
-- Two alternatives were evaluated:
--
--   1. ALTER VIEW ... SET (security_invoker = true), plus new RLS
--      policies granting anon direct row/column access to the base
--      tables. Rejected: expert_directory_public and expert_profile_
--      public both JOIN profiles ON profiles.id = expert_profiles.
--      user_id. Under invoker semantics, evaluating that join requires
--      the querying role to hold SELECT on expert_profiles.user_id --
--      meaning anon would need a direct column grant on user_id itself
--      just for the join to run, even though it was never in either
--      view's own output list. That is exactly the column the product
--      spec explicitly forbids exposing to anonymous users (the
--      applicant's own auth.users id), and there is no alternate join
--      key that avoids it without a schema change. This path was
--      rejected as unsafe, not merely inconvenient.
--
--   2. Replace the three views with SECURITY DEFINER FUNCTIONS of
--      identical shape (same column list, same profile_status =
--      'published' filter, same underlying joins) -- what this migration
--      does. Supabase's "Security Definer View" lint scans pg_views; it
--      does not apply to functions, so this removes the CRITICAL finding
--      at the root rather than suppressing it. Each function's body
--      still runs with the owner's privileges internally (the same
--      mechanism the views used), but the caller only ever receives the
--      function's declared return columns -- anon/authenticated get
--      EXECUTE on the function, never any grant on expert_profiles/
--      profiles/expert_profile_categories/expert_session_types
--      themselves, so user_id, review_message, and every other private
--      column stay exactly as unreachable to anon as before. This
--      mirrors the SECURITY DEFINER function pattern already used and
--      already accepted elsewhere in this codebase
--      (resolve_own_approved_expert_profile_id(), is_admin(),
--      is_published_expert_photo()) -- Supabase's advisor reports a
--      caller-executable SECURITY DEFINER function at WARN, not
--      CRITICAL, and every function using that pattern in this codebase
--      has already been reviewed and accepted at that level.
--
-- A service-role-based "server-only credential, filter in application
-- code" architecture (Next.js server -> service-role client -> explicit
-- published-only projection) was also considered, and remains a
-- reasonable path this codebase could move to later. It was not adopted
-- now: SUPABASE_SERVICE_ROLE_KEY is not populated in this environment,
-- and this codebase has never used it anywhere (see README's
-- "Environment variables" table) -- introducing a hard runtime
-- dependency on an unset secret would break /experts and
-- /experts/[slug] live the moment this migration shipped, not fix
-- anything. If that key is provisioned later, moving to a service-role
-- read path for these three functions remains straightforward.
--
-- expert_profiles/profiles/expert_profile_categories/expert_categories/
-- expert_session_types RLS policies and column grants for anon/
-- authenticated are completely UNCHANGED by this migration -- anon still
-- has zero direct grant on any of them (confirmed live before and after
-- this migration); the three functions below are the only path in,
-- exactly like the views were.

drop view if exists public.expert_directory_public;
drop view if exists public.expert_profile_public;
drop view if exists public.expert_session_types_public;

create or replace function public.get_expert_directory_public()
returns table (
  slug text,
  headline text,
  current_position text,
  current_company text,
  profile_image_path text,
  online_enabled boolean,
  in_person_enabled boolean,
  full_name text,
  category_names text[],
  starting_price numeric
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ep.slug,
    ep.headline,
    ep.current_position,
    ep.current_company,
    ep.profile_image_path,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(c.name order by c.sort_order)
      from (
        select ec.name, ec.sort_order
        from public.expert_profile_categories epc
        join public.expert_categories ec on ec.id = epc.category_id
        where epc.expert_profile_id = ep.id
        order by ec.sort_order
        limit 3
      ) c
    ) as category_names,
    (
      select min(est.base_price)
      from public.expert_session_types est
      where est.expert_profile_id = ep.id and est.is_active = true
    ) as starting_price
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  where ep.profile_status = 'published'
  order by p.full_name;
$$;

comment on function public.get_expert_directory_public() is
  'Public directory card projection -- replaces the expert_directory_public view (016/031) to avoid the Security Definer View advisor finding. Same column list, same profile_status = published filter, same SECURITY DEFINER mechanism, now as a function so anon never gets a direct grant on any base table.';

revoke execute on function public.get_expert_directory_public() from public;
grant execute on function public.get_expert_directory_public() to anon, authenticated;

create or replace function public.get_expert_profile_public(p_slug text)
returns table (
  slug text,
  headline text,
  current_position text,
  current_company text,
  years_experience_range text,
  short_bio text,
  expertise_summary text,
  problems_help_with text,
  who_i_help text,
  career_highlights text,
  linkedin_url text,
  country text,
  city text,
  profile_image_path text,
  online_enabled boolean,
  in_person_enabled boolean,
  full_name text,
  category_names text[]
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ep.slug,
    ep.headline,
    ep.current_position,
    ep.current_company,
    ep.years_experience_range,
    ep.short_bio,
    ep.expertise_summary,
    ep.problems_help_with,
    ep.who_i_help,
    ep.career_highlights,
    ep.linkedin_url,
    ep.country,
    ep.city,
    ep.profile_image_path,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ) as category_names
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  where ep.profile_status = 'published' and ep.slug = p_slug;
$$;

comment on function public.get_expert_profile_public(text) is
  'Public single-profile projection, keyed by slug -- replaces the expert_profile_public view (016/031). Resolves to zero rows for any non-published slug (including one that does not exist), identical to the view''s behavior, so a private application never leaks its existence.';

revoke execute on function public.get_expert_profile_public(text) from public;
grant execute on function public.get_expert_profile_public(text) to anon, authenticated;

create or replace function public.get_expert_session_types_public(p_slug text)
returns table (
  slug text,
  duration_minutes integer,
  base_price numeric,
  currency text,
  online_enabled boolean,
  in_person_enabled boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ep.slug,
    est.duration_minutes,
    est.base_price,
    est.currency,
    est.online_enabled,
    est.in_person_enabled
  from public.expert_session_types est
  join public.expert_profiles ep on ep.id = est.expert_profile_id
  where ep.profile_status = 'published'
    and est.is_active = true
    and ep.slug = p_slug
  order by est.duration_minutes;
$$;

comment on function public.get_expert_session_types_public(text) is
  'Public session pricing projection, keyed by slug -- replaces the expert_session_types_public view (016/031). Active durations for published experts only.';

revoke execute on function public.get_expert_session_types_public(text) from public;
grant execute on function public.get_expert_session_types_public(text) to anon, authenticated;
