-- 053_admin_update_profile_names.sql
--
-- Lets admins correct an expert's name from the admin editor. Admins could
-- already read every profile (013) but only update their own. The column
-- grant still limits authenticated updates to full_name/phone/country/
-- city, and protect_privileged_profile_fields() still keeps role and
-- account_status unchanged for anyone but the service role.

create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
