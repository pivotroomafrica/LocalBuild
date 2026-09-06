-- 005_expert_profiles.sql
-- Phase 2: supply side. This table is both the expert APPLICATION record
-- and the foundation of the future expert professional profile.
--
-- profiles
--     |
--     v
-- expert_profiles   <- this migration (max ONE row per user, like
--                       customer_profiles)
--
-- Becoming an applicant never changes profiles.role: role stays 'customer'
-- through this entire phase. Ownership of an expert application is
-- represented purely by this row existing, not by a role value. Only a
-- future admin action (Phase 3) may promote role to 'expert'.

create table public.expert_profiles (
  id uuid primary key default gen_random_uuid(),

  -- One expert profile/application per user, enforced at the database
  -- level (unique constraint), not just in application code.
  user_id uuid not null unique references public.profiles (id) on delete cascade,

  -- Future public-profile URL slug (Phase 4). Generated server-side from
  -- the applicant's name when the draft is first created -- never
  -- client-supplied -- with a numeric-suffix strategy on collision
  -- (hailemichael-adugna, hailemichael-adugna-2, ...).
  slug text not null unique,

  headline text,
  current_position text,
  current_company text,
  years_experience_range text
    check (years_experience_range is null or years_experience_range in (
      'lt_5', '5_9', '10_14', '15_19', '20_plus'
    )),
  short_bio text,
  expertise_summary text,
  problems_help_with text,
  who_i_help text,
  career_highlights text,
  linkedin_url text,
  country text,
  city text,

  -- Storage path only (supabase/migrations/009_expert_storage.sql), never
  -- image bytes in Postgres.
  profile_image_path text,

  -- Applicant-controlled states end at 'submitted'. 'approved'/'rejected'
  -- are reserved for a future admin action (Phase 3) and are enforced by
  -- protect_expert_profile_privileged_fields() in
  -- 010_expert_rls.sql -- not by this check constraint alone.
  application_status text not null default 'draft'
    check (application_status in ('draft', 'submitted', 'approved', 'rejected')),

  -- 'published'/'suspended' are reserved for future admin/marketplace
  -- control (Phase 3/4). An applicant may only ever reach 'draft'/'ready'
  -- during Phase 2 -- again enforced by the trigger, not this constraint.
  profile_status text not null default 'draft'
    check (profile_status in ('draft', 'ready', 'published', 'suspended')),

  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expert_slug_length check (char_length(slug) between 1 and 160),
  constraint expert_headline_length check (
    headline is null or char_length(headline) <= 160
  ),
  constraint expert_current_position_length check (
    current_position is null or char_length(current_position) <= 120
  ),
  constraint expert_current_company_length check (
    current_company is null or char_length(current_company) <= 150
  ),
  constraint expert_short_bio_length check (
    short_bio is null or char_length(short_bio) <= 1500
  ),
  constraint expert_expertise_summary_length check (
    expertise_summary is null or char_length(expertise_summary) <= 1500
  ),
  constraint expert_problems_help_with_length check (
    problems_help_with is null or char_length(problems_help_with) <= 1500
  ),
  constraint expert_who_i_help_length check (
    who_i_help is null or char_length(who_i_help) <= 1000
  ),
  constraint expert_career_highlights_length check (
    career_highlights is null or char_length(career_highlights) <= 1500
  ),
  constraint expert_linkedin_url_format check (
    linkedin_url is null or (
      char_length(linkedin_url) <= 300
      and linkedin_url ~* '^https?://([a-z]{2,3}\.)?linkedin\.com/.+$'
    )
  ),
  constraint expert_country_length check (country is null or char_length(country) <= 100),
  constraint expert_city_length check (city is null or char_length(city) <= 100)
);

comment on table public.expert_profiles is
  'Expert application + future professional profile. user_id is unique: at most one row per user. Submitting an application never changes profiles.role.';

alter table public.expert_profiles enable row level security;
-- Policies, column grants and the privileged-field trigger live in
-- 010_expert_rls.sql, following the same pattern as Phase 1.

create trigger set_expert_profiles_updated_at
  before update on public.expert_profiles
  for each row
  execute function public.set_updated_at();
