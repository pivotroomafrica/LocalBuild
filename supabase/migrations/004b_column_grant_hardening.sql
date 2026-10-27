-- 004b_column_grant_hardening.sql (applied to the demo project as
-- 006_column_grant_hardening on 2026-09-06; recovered into the repo).

revoke update (role, account_status) on public.profiles from authenticated;
revoke update (user_id) on public.customer_profiles from authenticated;
