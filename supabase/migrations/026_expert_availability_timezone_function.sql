-- 026_expert_availability_timezone_function.sql
-- Phase 4 adjustment: fills a gap left by 022_retire_weekly_availability_
-- model.sql, which dropped save_expert_availability_schedule() -- the
-- ONLY function that ever wrote expert_availability_settings.timezone.
-- That table was deliberately kept and reused (spec section 23), but
-- nothing was left to write it. Migrations 001-025 are not modified.

create or replace function public.set_expert_availability_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_expert_profile_id uuid;
begin
  v_expert_profile_id := public.resolve_own_approved_expert_profile_id();

  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone: %', p_timezone using errcode = '22023';
  end if;

  insert into public.expert_availability_settings (expert_profile_id, timezone)
  values (v_expert_profile_id, p_timezone)
  on conflict (expert_profile_id) do update set timezone = excluded.timezone;
end;
$$;

comment on function public.set_expert_availability_timezone(text) is
  'The only write path for expert_availability_settings.timezone. Resolves the caller''s own approved expert_profile_id server-side, never accepts one as input.';

revoke execute on function public.set_expert_availability_timezone(text) from public, anon;
grant execute on function public.set_expert_availability_timezone(text) to authenticated;
