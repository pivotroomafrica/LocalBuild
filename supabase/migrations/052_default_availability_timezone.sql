-- 052_default_availability_timezone.sql
--
-- get_bookable_slots(), create_booking_hold() and the reschedule functions
-- join expert_availability_settings, but that row was only written when an
-- expert changed their timezone. An expert who kept the default
-- (Africa/Addis_Ababa) had no row, so clients saw "No free times" even
-- with availability set. Every expert now gets the row when their profile
-- is created, and existing experts are backfilled. Non-destructive.

create or replace function public.create_default_availability_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.expert_availability_settings (expert_profile_id)
  values (new.id)
  on conflict (expert_profile_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.create_default_availability_settings() from public, anon, authenticated;

create or replace trigger create_default_availability_settings
  after insert on public.expert_profiles
  for each row execute function public.create_default_availability_settings();

insert into public.expert_availability_settings (expert_profile_id)
select ep.id from public.expert_profiles ep
on conflict (expert_profile_id) do nothing;
