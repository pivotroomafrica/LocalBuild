-- 065: Remove expert topics (064). The home page "Explore experts by topic"
-- section and everything behind it were removed in favour of a call to
-- action.
--
-- Apply ONLY after the app version without topics is deployed: older
-- builds call get_expert_topics_public() and would fail without it.

drop function if exists public.get_expert_topics_public();

alter table public.expert_profiles drop constraint if exists expert_profiles_topics_limit;
alter table public.expert_profiles drop column if exists topics;
