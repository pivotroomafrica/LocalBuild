-- 049c_public_directory_v2.sql
--
-- Public read functions for the redesigned site. New functions (not
-- replacements) because the return columns change and DROP isn't used.
--
-- Ranking ("Ranked by sessions completed and by what clients said"):
--   sessions_completed = paid (confirmed/completed) bookings whose end
--                        time has passed;
--   rating_avg / review_count from visible expert_reviews.
--   is_top_expert: at least 3 sessions completed AND at least 2 reviews
--                  AND an average of 4.5 or more. Until an expert meets
--                  that, no badge is shown -- nothing is invented.
-- Directory order: top experts first, then sessions completed, rating,
-- review count, name.

create or replace function public.expert_public_stats(p_expert_profile_id uuid)
returns table (sessions_completed integer, review_count integer, rating_avg numeric, is_top_expert boolean)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select count(*)::integer as n
    from public.bookings b
    where b.expert_profile_id = p_expert_profile_id
      and b.booking_status in ('confirmed', 'completed')
      and b.end_at < now()
  ),
  r as (
    select count(*)::integer as n, round(avg(rating)::numeric, 2) as avg
    from public.expert_reviews
    where expert_profile_id = p_expert_profile_id and not is_hidden
  )
  select s.n, r.n, r.avg, (s.n >= 3 and r.n >= 2 and coalesce(r.avg, 0) >= 4.5)
  from s, r;
$$;

revoke execute on function public.expert_public_stats(uuid) from public, anon, authenticated;

create or replace function public.get_expert_directory_public_v2()
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
  starting_price numeric,
  starting_duration_minutes integer,
  languages text[],
  sessions_completed integer,
  review_count integer,
  rating_avg numeric,
  is_top_expert boolean
)
language sql
stable
security definer
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
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    cheapest.base_price,
    cheapest.duration_minutes,
    ep.languages,
    st.sessions_completed,
    st.review_count,
    st.rating_avg,
    st.is_top_expert
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  cross join lateral public.expert_public_stats(ep.id) st
  left join lateral (
    select est.base_price, est.duration_minutes
    from public.expert_session_types est
    where est.expert_profile_id = ep.id and est.is_active = true
    order by est.base_price, est.duration_minutes
    limit 1
  ) cheapest on true
  where ep.profile_status = 'published'
  order by st.is_top_expert desc, st.sessions_completed desc, st.rating_avg desc nulls last,
    st.review_count desc, p.full_name;
$$;

revoke execute on function public.get_expert_directory_public_v2() from public;
grant execute on function public.get_expert_directory_public_v2() to anon, authenticated;

create or replace function public.get_expert_profile_public_v2(p_slug text)
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
  category_names text[],
  languages text[],
  response_time text,
  experience jsonb,
  sessions_completed integer,
  review_count integer,
  rating_avg numeric,
  is_top_expert boolean
)
language sql
stable
security definer
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
    ),
    ep.languages,
    ep.response_time,
    ep.experience,
    st.sessions_completed,
    st.review_count,
    st.rating_avg,
    st.is_top_expert
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  cross join lateral public.expert_public_stats(ep.id) st
  where ep.profile_status = 'published' and ep.slug = p_slug;
$$;

revoke execute on function public.get_expert_profile_public_v2(text) from public;
grant execute on function public.get_expert_profile_public_v2(text) to anon, authenticated;
