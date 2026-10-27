-- 004c_performance_hardening.sql (applied to the demo project as
-- 007_performance_hardening on 2026-09-06; recovered into the repo).

create index if not exists customer_profiles_industry_id_idx on public.customer_profiles (industry_id);

drop policy "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy "customer_profiles_select_own" on public.customer_profiles;
create policy "customer_profiles_select_own" on public.customer_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy "customer_profiles_insert_own" on public.customer_profiles;
create policy "customer_profiles_insert_own" on public.customer_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy "customer_profiles_update_own" on public.customer_profiles;
create policy "customer_profiles_update_own" on public.customer_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
