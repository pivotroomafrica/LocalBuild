-- Live figures for the About page ("Pivotroom today"). Counts only:
-- no names, amounts or other personal data.
create or replace function public.get_platform_stats_public()
returns table (live_experts bigint, topics bigint, sessions_booked bigint, clients_served bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    (select count(*) from public.expert_profiles where profile_status = 'published'),
    (select count(*) from public.expert_categories where is_active),
    (select count(*) from public.bookings where booking_status in ('confirmed', 'completed')),
    (select count(distinct customer_id) from public.bookings where booking_status in ('confirmed', 'completed'));
$$;

revoke execute on function public.get_platform_stats_public() from public;
grant execute on function public.get_platform_stats_public() to anon, authenticated;
