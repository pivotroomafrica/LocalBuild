-- 050_expert_onboarding_and_visibility.sql
--
-- Fast expert onboarding (3 steps) + admin control over what a published
-- profile shows (2026-10-26).
--
--   * terms_accepted_at -- stamped (server time) when the expert ticks
--     "I agree to the expert terms" before submitting. Only the expert can
--     set it, once; admins cannot set it for them.
--   * hidden_fields     -- profile details an ADMIN has chosen not to show
--     publicly. Experts can never change it. Every public read function
--     masks these, so the expert page, directory, reviews and matching all
--     show only what admin allowed.
--   * Admins can edit an expert's categories (insert/delete policies), in
--     addition to the profile fields they could already update.
--   * The superseded v1 public functions (031) are no longer callable by
--     visitors, so nothing bypasses the masking.
--
-- Non-destructive: two new columns, one trigger, two policies, and
-- re-created function bodies with unchanged signatures.

alter table public.expert_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists hidden_fields text[] not null default '{}';

alter table public.expert_profiles
  add constraint expert_profiles_hidden_fields_valid check (
    hidden_fields <@ array[
      'photo', 'current_position', 'current_company', 'years_experience', 'location', 'linkedin',
      'languages', 'response_time', 'short_bio', 'expertise_summary', 'problems_help_with',
      'who_i_help', 'career_highlights', 'experience', 'reviews', 'stats'
    ]::text[]
  );

comment on column public.expert_profiles.terms_accepted_at is 'When the expert accepted the expert terms (server time). Set once by the expert.';
comment on column public.expert_profiles.hidden_fields is
  'Profile details an admin chose not to show publicly. Admin-only; masked by every public read function.';

grant update (terms_accepted_at, hidden_fields) on public.expert_profiles to authenticated;

create or replace function public.protect_expert_profile_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    -- Admins decide visibility, but never accept terms on someone's behalf.
    new.terms_accepted_at := old.terms_accepted_at;
  else
    new.hidden_fields := old.hidden_fields;
    if old.terms_accepted_at is not null then
      new.terms_accepted_at := old.terms_accepted_at;
    elsif new.terms_accepted_at is not null then
      new.terms_accepted_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_expert_profile_visibility() from public, anon, authenticated;

create or replace trigger protect_expert_profile_visibility
  before update on public.expert_profiles
  for each row execute function public.protect_expert_profile_visibility();

create policy expert_profile_categories_insert_admin on public.expert_profile_categories
  for insert to authenticated
  with check ((select public.is_admin()));

create policy expert_profile_categories_delete_admin on public.expert_profile_categories
  for delete to authenticated
  using ((select public.is_admin()));

revoke execute on function public.get_expert_profile_public(text) from anon, authenticated;
revoke execute on function public.get_expert_directory_public() from anon, authenticated;
