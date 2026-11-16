-- 064: Topics an expert helps with (the chips under each category on the
-- home page, lib/site/topics.ts).
--
-- Experts never pick these by hand: when they save their AI-drafted
-- profile, the server works them out from what they already said (the AI
-- picks from the topics of their chosen areas; a word-match fallback when
-- AI isn't available). So there is deliberately NO column UPDATE grant for
-- authenticated: only server code (service role) and admins write them.

alter table public.expert_profiles
  add column if not exists topics text[] not null default '{}';

alter table public.expert_profiles drop constraint if exists expert_profiles_topics_limit;
alter table public.expert_profiles
  add constraint expert_profiles_topics_limit check (cardinality(topics) <= 12);

-- Published experts' topics, for the directory's "experts for this topic"
-- filter. Read through a definer function like the other public data.
create or replace function public.get_expert_topics_public()
returns table (slug text, topics text[])
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select ep.slug, ep.topics
  from public.expert_profiles ep
  where ep.profile_status = 'published'
    and cardinality(ep.topics) > 0;
$$;

revoke execute on function public.get_expert_topics_public() from public;
grant execute on function public.get_expert_topics_public() to anon, authenticated;
