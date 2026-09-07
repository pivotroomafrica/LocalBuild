-- 016_public_expert_views.sql
-- Phase 3: the public expert directory (/experts) and public expert
-- profile (/experts/[slug]) read exclusively through the views defined
-- here, never directly against expert_profiles/profiles/
-- expert_profile_categories/expert_session_types. Those tables stay fully
-- RLS-locked to their owner (plus the admin policies from
-- 013_admin_authorization.sql) -- nothing here weakens that.
--
-- Why views instead of new RLS policies granting anon direct table
-- access: a view's SELECT list is a hard, explicit allowlist of columns
-- -- anon can never end up seeing a column added to expert_profiles by a
-- future migration just because a permissive RLS policy happened to match
-- the row. Per Postgres default behavior, a view runs with the
-- privileges of its OWNER (the migration-applying role), not the
-- querying role -- so these views can read fully through RLS on the base
-- tables while their own `where profile_status = 'published'` clause and
-- column list are the ONLY exposure boundary. This is a caller-independent
-- filter (published-ness, not "rows this caller owns"), so there is no
-- need for `security_invoker`.
--
-- Column choices, and one thing deliberately excluded:
--   - expert_profiles.id and expert_profiles.user_id are never selected.
--     The public key is `slug` (already exists, already unique, never a
--     UUID) -- exposing the row id or owning user_id would violate "never
--     expose ... user_id where avoidable" for no benefit.
--   - expert_profiles.profile_image_path IS selected here, because the
--     server needs it to generate a signed URL (getExpertPhotoUrl,
--     lib/expert/data.ts) -- but the path convention is
--     "<user_id>/profile-photo" (009_expert_storage.sql), so the RAW PATH
--     STRING ITSELF encodes the applicant's auth user_id. Application code
--     reading these views must resolve profile_image_path to a signed URL
--     SERVER-SIDE and pass only the resulting URL to any client-rendered
--     component -- never the raw path, and never the whole view row, to a
--     "use client" component.
--   - No email, phone, admin/review fields (review_message, reviewed_*,
--     approved_*, published_*), or account_status -- none of those columns
--     appear in either SELECT list, so there is nothing to leak no matter
--     how the view is queried.
--
-- expert_directory_public: card-list projection only (id/slug + the
-- handful of fields Phase 3 spec section 45 lists for a card). Full
-- bio/career highlights/etc. are deliberately NOT here -- those only ever
-- load on the single-profile page, per spec section 48 ("only fields
-- needed for cards on the directory ... full details only on the slug
-- page").
create view public.expert_directory_public as
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
    -- Lowest price among active/enabled durations. Every duration's price
    -- is a fixed proportional derivation of the same base_hourly_price
    -- (lib/expert/pricing.ts), so the minimum price and the
    -- shortest-enabled-duration price are always the same row -- a plain
    -- MIN() is correct, not an approximation, and never considers a
    -- disabled (is_active = false) row.
    select min(est.base_price)
    from public.expert_session_types est
    where est.expert_profile_id = ep.id and est.is_active = true
  ) as starting_price
from public.expert_profiles ep
join public.profiles p on p.id = ep.user_id
where ep.profile_status = 'published';

comment on view public.expert_directory_public is
  'Public, anon-readable directory card projection. Only published expert_profiles rows. No id/user_id/email/phone/admin fields.';

-- expert_profile_public: the full single-profile page projection (spec
-- section 46-49) -- everything the page needs except session pricing
-- (below, as its own view: one expert has many durations, so it does not
-- fit a single flat row here).
create view public.expert_profile_public as
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
where ep.profile_status = 'published';

comment on view public.expert_profile_public is
  'Public, anon-readable single-profile projection, keyed by slug. Only resolves for profile_status = published -- any other status returns zero rows, not an error, so a private application never leaks its existence via this view.';

-- expert_session_types_public: only active/enabled durations, only for
-- published experts. Keyed by slug (not expert_profile_id) so calling
-- code never has to see or handle the internal row id either.
create view public.expert_session_types_public as
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
  and est.is_active = true;

comment on view public.expert_session_types_public is
  'Public, anon-readable session pricing projection: active durations for published experts only, keyed by slug.';

grant select on public.expert_directory_public to anon, authenticated;
grant select on public.expert_profile_public to anon, authenticated;
grant select on public.expert_session_types_public to anon, authenticated;

-- Supporting index for the filter every one of the views above shares.
create index expert_profiles_profile_status_idx on public.expert_profiles (profile_status);

-- =========================================================================
-- Storage: publish photo delivery
-- =========================================================================
-- The bucket stays private (009_expert_storage.sql's `public: false` is
-- unchanged by this migration -- nothing here flips it). This policy adds
-- exactly one narrow, additional read path: an object under
-- expert-profile-images is readable by anon/authenticated ONLY if it is
-- the profile_image_path of a currently-published expert_profiles row.
-- Draft/submitted/changes_requested/approved-but-unpublished/rejected/
-- suspended photos are not matched by this policy and stay exactly as
-- private as before (the owner-only policy from 010_expert_rls.sql is
-- untouched and still the only way the applicant themselves can read
-- their own not-yet-published photo). This does not enable bucket listing
-- of anything beyond published photos: the policy is a row-level filter
-- on storage.objects, not a bucket-level public flag.
create policy "expert_photo_select_published"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'expert-profile-images'
    and exists (
      select 1 from public.expert_profiles ep
      where ep.profile_image_path = storage.objects.name
        and ep.profile_status = 'published'
    )
  );
