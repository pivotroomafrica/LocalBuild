-- 012_expert_review_fields.sql
-- Phase 3: admin review lifecycle. Purely additive on top of
-- expert_profiles (005_expert_profiles.sql) -- migrations 001-011 are not
-- modified.
--
-- Adds the one new application_status value Phase 3 needs
-- ('changes_requested') and the minimal audit trail spec section 30
-- explicitly sanctions for V1: a single current review message plus
-- who/when for each review milestone. No separate review-events/history
-- table -- a past round's message is intentionally not retained once a
-- new review action overwrites it (spec section 31: "it is acceptable to
-- have only: applicant-visible review message and no internal notes
-- system"). profile_status already has every value Phase 3 needs
-- (draft/ready/published/suspended, from 005_expert_profiles.sql) --
-- nothing to change there.

alter table public.expert_profiles
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id),
  add column review_message text,
  add column approved_at timestamptz,
  add column approved_by uuid references public.profiles (id),
  add column published_at timestamptz,
  add column published_by uuid references public.profiles (id);

alter table public.expert_profiles
  add constraint expert_review_message_length
    check (review_message is null or char_length(review_message) <= 2000);

-- Replaces the original 4-value check (005_expert_profiles.sql) with one
-- that also allows 'changes_requested'. This is a schema evolution via a
-- new migration, not an edit to 005 -- the old file on disk is untouched.
alter table public.expert_profiles
  drop constraint expert_profiles_application_status_check;

alter table public.expert_profiles
  add constraint expert_profiles_application_status_check
    check (application_status in ('draft', 'submitted', 'changes_requested', 'approved', 'rejected'));

comment on column public.expert_profiles.review_message is
  'Applicant-visible feedback from the most recent admin review action (changes requested or rejection reason). Overwritten by each new review action -- V1 keeps no history.';
