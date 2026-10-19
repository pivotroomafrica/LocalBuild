-- 049a_expert_profile_details.sql (049a-049c together)
--
-- Website redesign (2026-10-19): real data behind the new profile layout.
--
--   * languages      -- the languages the expert holds sessions in
--                       ("Amharic, English" on the profile).
--   * response_time  -- how quickly the expert commits to replying to
--                       booking questions; stated by the expert, shown as
--                       "Replies within a day". There is no messaging
--                       feature to measure it from yet.
--   * experience     -- dated timeline: [{start_year, end_year|null,
--                       title, organization}], newest first. end_year
--                       null means "now".
--
-- Non-destructive: three new columns with safe defaults, plus column
-- grants so the owner can edit them (same pattern as 010_expert_rls).

alter table public.expert_profiles
  add column if not exists languages text[] not null default '{}',
  add column if not exists response_time text,
  add column if not exists experience jsonb not null default '[]'::jsonb;

alter table public.expert_profiles
  add constraint expert_profiles_languages_count check (cardinality(languages) <= 8);

alter table public.expert_profiles
  add constraint expert_profiles_response_time_valid
    check (response_time is null or response_time in ('few_hours', 'one_day', 'two_days'));

alter table public.expert_profiles
  add constraint expert_profiles_experience_shape
    check (jsonb_typeof(experience) = 'array' and jsonb_array_length(experience) <= 12);

comment on column public.expert_profiles.languages is 'Session languages, e.g. {Amharic,English}. Max 8.';
comment on column public.expert_profiles.response_time is 'Expert''s stated reply commitment: few_hours | one_day | two_days.';
comment on column public.expert_profiles.experience is
  'Dated experience timeline: [{"start_year":2016,"end_year":null,"title":"...","organization":"..."}]. Max 12 entries; validated by the app.';

grant insert (languages, response_time, experience) on public.expert_profiles to authenticated;
grant update (languages, response_time, experience) on public.expert_profiles to authenticated;
