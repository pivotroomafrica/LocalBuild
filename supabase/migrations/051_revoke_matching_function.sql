-- 051_revoke_matching_function.sql
--
-- Matching was removed from the site (2026-10-26), so visitors no longer
-- need the candidates function. Non-destructive: the function and the
-- ai_match_requests table stay; only public execute access is removed.

revoke execute on function public.get_expert_match_candidates_public() from anon, authenticated;
