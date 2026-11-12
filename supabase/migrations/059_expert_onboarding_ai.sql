-- 059_expert_onboarding_ai.sql
--
-- Guided expert onboarding (AI-suggested answer chips + AI-drafted profile
-- text, OpenAI).
--
-- 1. expert_profiles.onboarding_answers: the expert's raw answers from the
--    guided flow (chosen chips, the card they reached, drafts they
--    approved). Lets the flow resume where they left off and lets drafts be
--    regenerated from the same answers. The profile columns themselves
--    (headline, short_bio, ...) are still written through the same
--    validators as the classic form; this column is only the expert's
--    working notes and is never shown publicly.
--
-- 2. ai_onboarding_requests: usage/cost log for the per-expert cap and for
--    monitoring spend. Stores NO answer text and NO model output -- only
--    kind, outcome, token counts and an estimated cost. RLS on with no
--    policies: only the server (service role) reads or writes it, same as
--    ai_match_requests (048).
--
-- Non-destructive: adds one column and one table.

alter table public.expert_profiles
  add column if not exists onboarding_answers jsonb;

alter table public.expert_profiles
  drop constraint if exists expert_profiles_onboarding_answers_size;
alter table public.expert_profiles
  add constraint expert_profiles_onboarding_answers_size
  check (onboarding_answers is null or pg_column_size(onboarding_answers) <= 32768);

comment on column public.expert_profiles.onboarding_answers is
  'Guided onboarding working answers (059). Private to the expert and admins; never shown publicly.';

-- Updates on expert_profiles are granted per column (010); add this one.
grant update (onboarding_answers) on public.expert_profiles to authenticated;

create table if not exists public.ai_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('chips', 'draft')),
  outcome text not null check (outcome in ('ai', 'fallback_no_key', 'fallback_error', 'rate_limited')),
  model text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_cost_usd numeric(10, 6) check (estimated_cost_usd >= 0)
);

create index if not exists ai_onboarding_requests_user_created_idx
  on public.ai_onboarding_requests (user_id, created_at desc);
create index if not exists ai_onboarding_requests_created_idx
  on public.ai_onboarding_requests (created_at desc);

alter table public.ai_onboarding_requests enable row level security;
revoke all on public.ai_onboarding_requests from anon, authenticated;

comment on table public.ai_onboarding_requests is
  'Guided onboarding AI usage log (059). No answer text or model output is stored. Server-only (service role).';
