-- 048_v2_ai_matching.sql
--
-- Pivotroom V2 -- AI expert matching (OpenAI, approved 2026-10-10).
--
-- 1. get_expert_match_candidates_public(): one compact row per PUBLISHED
--    expert with the fields matching needs, each truncated so the prompt
--    sent to the model stays small. Same published-only filter and
--    SECURITY DEFINER mechanism as get_expert_directory_public() (031);
--    exposes nothing that the public profile page doesn't already show.
--
-- 2. ai_match_requests: usage/cost log for abuse limits and monitoring.
--    Deliberately stores NO customer problem text and NO model output --
--    only counts, outcome, token usage and an estimated cost. The client
--    key is a salted hash (never a raw IP). RLS on with no policies:
--    only the server (service role) reads or writes it.
--
-- Non-destructive: adds one function and one table.

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
    left(ep.current_position, 80),
    left(ep.current_company, 80),
    (
      select array_agg(ec.name order by ec.sort_order)
      from public.expert_profile_categories epc
      join public.expert_categories ec on ec.id = epc.category_id
      where epc.expert_profile_id = ep.id
    ),
    left(ep.expertise_summary, 400),
    left(ep.problems_help_with, 400),
    left(ep.who_i_help, 240)
  from public.expert_profiles ep
  join public.profiles p on p.id = ep.user_id
  where ep.profile_status = 'published'
  order by p.full_name;
$function$;

revoke execute on function public.get_expert_match_candidates_public() from public;
grant execute on function public.get_expert_match_candidates_public() to anon, authenticated;

create table if not exists public.ai_match_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  client_key_hash text not null,
  outcome text not null check (outcome in ('ai', 'fallback_no_key', 'fallback_error', 'rate_limited')),
  model text,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  match_count integer not null default 0 check (match_count >= 0),
  prompt_tokens integer check (prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens >= 0),
  estimated_cost_usd numeric(10, 6) check (estimated_cost_usd >= 0)
);

create index if not exists ai_match_requests_client_created_idx
  on public.ai_match_requests (client_key_hash, created_at desc);
create index if not exists ai_match_requests_created_idx
  on public.ai_match_requests (created_at desc);
create index if not exists ai_match_requests_user_id_idx
  on public.ai_match_requests (user_id);

alter table public.ai_match_requests enable row level security;
revoke all on public.ai_match_requests from anon, authenticated;

comment on table public.ai_match_requests is
  'AI matching usage log (V2). No problem text or model output is stored. Server-only (service role).';
