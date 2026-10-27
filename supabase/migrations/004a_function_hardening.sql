-- 004a_function_hardening.sql (applied to the demo project as
-- 005_function_hardening on 2026-09-06; recovered into the repo so a fresh
-- project built from these files matches it).
-- Security lint fixes: pin search_path on all SECURITY DEFINER / trigger
-- functions and remove them from the PostgREST RPC surface, since they are
-- only ever invoked by triggers, never called directly by API clients.

alter function public.set_updated_at() set search_path = public;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.protect_privileged_profile_fields() from public, anon, authenticated;
