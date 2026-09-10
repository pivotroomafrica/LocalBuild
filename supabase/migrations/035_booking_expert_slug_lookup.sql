-- 035_booking_expert_slug_lookup.sql
-- Phase 5: one small read-only helper the booking journey UI needs.
-- Migrations 001-034 are not modified.
--
-- expert_profiles RLS (010_expert_rls.sql) only lets the owner or an
-- admin select a row -- a customer who holds a booking against that
-- expert has no read access to expert_profiles at all, so there is no
-- way to resolve booking.expert_profile_id back to the expert's public
-- slug for the "Choose Another Time" / "Book again" links (spec section
-- 58: back to the SAME expert/duration/format) without either widening
-- expert_profiles RLS (out of scope, and unnecessary for one column) or
-- a narrow function like every other cross-boundary read in this
-- codebase (get_expert_directory_public, get_expert_profile_public,
-- etc, 031_public_data_functions.sql).
--
-- Ownership is re-derived from auth.uid() against the booking's own
-- customer_id every call -- never trusts the booking_id alone. Returns
-- the slug only if the expert is still published (matching every other
-- public read path); an unpublished/suspended expert's slug is withheld
-- even from a customer who has a real (now-orphaned) booking against
-- them, same as the public directory would show nothing for that expert
-- either.

create or replace function public.get_expert_slug_for_booking(p_booking_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_slug text;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    return null;
  end if;

  select ep.slug
    into v_slug
  from public.bookings b
  join public.expert_profiles ep on ep.id = b.expert_profile_id
  where b.id = p_booking_id
    and b.customer_id = v_customer_id
    and ep.profile_status = 'published'
    and ep.application_status = 'approved';

  return v_slug;
end;
$$;

comment on function public.get_expert_slug_for_booking(uuid) is
  'Resolves a booking the caller owns to its expert''s public slug, for "Choose Another Time" / resume links only -- never exposes any other expert_profiles column, and returns null for a booking that is not the caller''s own or whose expert is no longer published.';

revoke execute on function public.get_expert_slug_for_booking(uuid) from public, anon;
grant execute on function public.get_expert_slug_for_booking(uuid) to authenticated;
