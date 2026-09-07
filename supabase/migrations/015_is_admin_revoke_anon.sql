-- 015_is_admin_revoke_anon.sql
-- Security advisor (run after 013_admin_authorization.sql /
-- 014_expert_review_trigger_fix.sql) flagged public.is_admin() as callable
-- by the anon role via /rest/v1/rpc/is_admin. 013's
-- `revoke execute ... from public` only stripped the implicit PUBLIC
-- pseudo-role grant every new function gets by default -- Supabase
-- separately auto-grants EXECUTE on new functions to anon/authenticated/
-- service_role via its own default privileges, which a PUBLIC-only revoke
-- does not touch.
--
-- Not a data leak (is_admin() only reports whether the CALLER is an
-- admin, which reveals nothing about anyone else), but it has no
-- legitimate anon use -- anonymous requests are never admin -- so it is
-- removed from the anon-callable RPC surface for hygiene, matching the
-- least-privilege posture used everywhere else in this schema.
-- authenticated keeps EXECUTE: RLS policies evaluated for logged-in users
-- (and the trigger) need to call it.

revoke execute on function public.is_admin() from anon;
