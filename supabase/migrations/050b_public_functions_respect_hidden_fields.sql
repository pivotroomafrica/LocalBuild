-- 050b_public_functions_respect_hidden_fields.sql
--
-- Re-creates the public read functions (same signatures) so every detail
-- an admin listed in expert_profiles.hidden_fields (050) comes back NULL /
-- empty to visitors: the expert page, the directory cards, reviews and the
-- matching candidates.

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
    case when 'current_position' = any(ep.hidden_fields) then null else ep.current_position end,
    case when 'current_company' = any(ep.hidden_fields) then null else ep.current_company end,
    case when 'years_experience' = any(ep.hidden_fields) then null else ep.years_experience_range end,
    case when 'short_bio' = any(ep.hidden_fields) then null else ep.short_bio end,
    case when 'expertise_summary' = any(ep.hidden_fields) then null else ep.expertise_summary end,
    case when 'problems_help_with' = any(ep.hidden_fields) then null else ep.problems_help_with end,
    case when 'who_i_help' = any(ep.hidden_fields) then null else ep.who_i_help end,
    case when 'career_highlights' = any(ep.hidden_fields) then null else ep.career_highlights end,
    case when 'linkedin' = any(ep.hidden_fields) then null else ep.linkedin_url end,
    case when 'location' = any(ep.hidden_fields) then null else ep.country end,
    case when 'location' = any(ep.hidden_fields) then null else ep.city end,
    case when 'photo' = any(ep.hidden_fields) then null else ep.profile_image_path end,
    ep.online_enabled,
    ep.in_person_enabled,
    p.full_name,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    case when 'languages' = any(ep.hidden_fields) then '{}'::text[] else ep.languages end,
    case when 'response_time' = any(ep.hidden_fields) then null else ep.response_time end,
    case when 'experience' = any(ep.hidden_fields) then '[]'::jsonb else ep.experience end,
    case when 'stats' = any(ep.hidden_fields) then 0 else st.sessions_completed end,
    case when 'stats' = any(ep.hidden_fields) or 'reviews' = any(ep.hidden_fields) then 0 else st.review_count end,
    case when 'stats' = any(ep.hidden_fields) or 'reviews' = any(ep.hidden_fields) then null else st.rating_avg end,
    case when 'stats' = any(ep.hidden_fields) then false else st.is_top_expert end
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  cross join lateral public.expert_public_stats(ep.id) st
  where ep.profile_status = 'published' and ep.slug = p_slug;
$$;

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
    case when 'current_position' = any(ep.hidden_fields) then null else ep.current_position end,
    case when 'current_company' = any(ep.hidden_fields) then null else ep.current_company end,
    case when 'photo' = any(ep.hidden_fields) then null else ep.profile_image_path end,
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
    case when 'languages' = any(ep.hidden_fields) then '{}'::text[] else ep.languages end,
    case when 'stats' = any(ep.hidden_fields) then 0 else st.sessions_completed end,
    case when 'stats' = any(ep.hidden_fields) or 'reviews' = any(ep.hidden_fields) then 0 else st.review_count end,
    case when 'stats' = any(ep.hidden_fields) or 'reviews' = any(ep.hidden_fields) then null else st.rating_avg end,
    case when 'stats' = any(ep.hidden_fields) then false else st.is_top_expert end
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

create or replace function public.get_expert_reviews_public(p_slug text)
returns table (
  rating smallint,
  body text,
  reviewer_name text,
  duration_minutes integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.rating,
    r.body,
    case
      when p.full_name is null or btrim(p.full_name) = '' then 'Pivotroom client'
      when position(' ' in btrim(p.full_name)) = 0 then btrim(p.full_name)
      else split_part(btrim(p.full_name), ' ', 1) || ' '
        || upper(left(regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
    end,
    b.duration_minutes,
    r.created_at
  from public.expert_reviews r
  join public.expert_profiles ep on ep.id = r.expert_profile_id
  join public.bookings b on b.id = r.booking_id
  join public.profiles p on p.id = r.customer_id
  where ep.slug = p_slug
    and ep.profile_status = 'published'
    and not ('reviews' = any(ep.hidden_fields))
    and not r.is_hidden
  order by r.created_at desc
  limit 24;
$$;

create or replace function public.get_expert_match_candidates_public()
returns table (
  slug text,
  full_name text,
  headline text,
  current_position text,
  current_company text,
  category_names text[],
  expertise_summary text,
  problems_help_with text,
  who_i_help text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    ep.slug,
    p.full_name,
    left(ep.headline, 160),
    case when 'current_position' = any(ep.hidden_fields) then null else left(ep.current_position, 80) end,
    case when 'current_company' = any(ep.hidden_fields) then null else left(ep.current_company, 80) end,
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    case when 'expertise_summary' = any(ep.hidden_fields) then null else left(ep.expertise_summary, 400) end,
    case when 'problems_help_with' = any(ep.hidden_fields) then null else left(ep.problems_help_with, 400) end,
    case when 'who_i_help' = any(ep.hidden_fields) then null else left(ep.who_i_help, 240) end
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  where ep.profile_status = 'published'
  order by p.full_name;
$function$;
