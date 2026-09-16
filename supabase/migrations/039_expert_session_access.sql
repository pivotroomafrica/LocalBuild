-- 039_expert_session_access.sql
-- Phase 7: the one database change this phase genuinely needs -- letting
-- an expert read their OWN confirmed/completed bookings (and that
-- booking's intake), plus a narrow, minimal projection of the customer's
-- professional context for that same booking. Migrations 001-038 are not
-- modified.
--
-- Why this is required: bookings/booking_intake RLS (033_bookings_rls.sql)
-- only ever granted SELECT to the booking's own customer or an admin --
-- Phase 5/6 never needed an expert-facing read path, since a booking
-- could not yet be 'confirmed'. Phase 7 adds the first legitimate reason
-- for an expert to read a booking at all, and the access must be
-- extremely narrow: only rows where this caller is the expert AND the
-- booking has reached 'confirmed' (or 'completed', reachable by a future
-- phase) -- never 'held'/'awaiting_payment'/'expired'/'cancelled' (spec
-- section 25: "Expert must NOT know a customer is trying to book them
-- until booking becomes confirmed" -- enforced here in the RLS predicate
-- itself, not merely hidden in the UI).

-- =========================================================================
-- bookings: expert read access, confirmed/completed only
-- =========================================================================
-- The subquery against expert_profiles is safe under RLS here (unlike
-- the anon/published-photo case fixed in 017_expert_photo_public_fix.sql):
-- the caller can only ever match their OWN expert_profiles row, and
-- expert_profiles_select_own (010_expert_rls.sql) already permits exactly
-- that row for exactly this caller -- so no SECURITY DEFINER bypass is
-- needed for this policy to work correctly.
create policy "bookings_select_own_expert"
  on public.bookings
  for select
  to authenticated
  using (
    booking_status in ('confirmed', 'completed')
    and expert_profile_id in (
      select id from public.expert_profiles where user_id = (select auth.uid())
    )
  );

-- =========================================================================
-- booking_intake: expert read access, same confirmed/completed gate
-- =========================================================================
create policy "booking_intake_select_expert"
  on public.booking_intake
  for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      join public.expert_profiles ep on ep.id = b.expert_profile_id
      where b.id = booking_intake.booking_id
        and ep.user_id = (select auth.uid())
        and b.booking_status in ('confirmed', 'completed')
    )
  );

-- =========================================================================
-- get_customer_context_for_booking() -- the one new function.
-- =========================================================================
-- Spec sections 27-31: an expert may see just enough of a confirmed
-- customer's professional context to prepare for the session -- never
-- email/phone/auth identifiers/payment records/other bookings, and never
-- through a broad grant on customer_profiles or profiles (which stay
-- exactly as owner/admin-only as they've been since Phase 1/3). This
-- function is the ONLY path: SECURITY DEFINER so it can read those two
-- tables despite the caller having no RLS access to them, but it
-- re-derives the expert's own identity from auth.uid() and re-validates
-- booking ownership + confirmed/completed status internally before
-- returning anything -- the same "ownership + status checks inside the
-- function, not trusted from the caller" pattern as every other
-- SECURITY DEFINER function in this project.
create or replace function public.get_customer_context_for_booking(p_booking_id uuid)
returns table(
  full_name text,
  "current_role" text,
  employment_type text,
  company_name text,
  industry_name text,
  years_experience_range text,
  linkedin_url text
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_expert_user_id uuid;
  v_booking public.bookings%rowtype;
begin
  v_expert_user_id := auth.uid();
  if v_expert_user_id is null then
    return;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return;
  end if;

  if v_booking.booking_status not in ('confirmed', 'completed') then
    return;
  end if;

  if not exists (
    select 1 from public.expert_profiles ep
    where ep.id = v_booking.expert_profile_id
      and ep.user_id = v_expert_user_id
  ) then
    return;
  end if;

  return query
    select
      p.full_name,
      cp.current_role,
      cp.employment_type,
      cp.company_name,
      ind.name as industry_name,
      cp.years_experience_range,
      cp.linkedin_url
    from public.profiles p
    left join public.customer_profiles cp on cp.user_id = p.id
    left join public.industries ind on ind.id = cp.industry_id
    where p.id = v_booking.customer_id;
end;
$$;

comment on function public.get_customer_context_for_booking(uuid) is
  'The only way an expert reads any customer professional-profile data. Re-derives the expert''s identity from auth.uid(), re-validates booking ownership and confirmed/completed status internally, and returns only the minimal fields a session-preparation view needs -- never email/phone/auth identifiers/payment data/other bookings. Returns zero rows for any booking that is not the caller''s own confirmed/completed booking, indistinguishable from a booking that does not exist.';

revoke execute on function public.get_customer_context_for_booking(uuid) from public, anon;
grant execute on function public.get_customer_context_for_booking(uuid) to authenticated;
