-- 067: Book up to a year ahead.
--
-- An expert's monthly plan (060: N hours a month on chosen days) now spans
-- the next 12 months. Clients still only see the next three months that
-- have free time (the booking card); when a month is booked up to the
-- expert's monthly hours it drops out (060 already hides it) and the next
-- month with free time takes its place.
--
-- booking_horizon_days() is read by get_bookable_slots, create_booking_hold
-- and reschedule_booking, so all three move together.

create or replace function public.booking_horizon_days()
returns integer
language sql
immutable
set search_path to 'public'
as $function$ select 365; $function$;
