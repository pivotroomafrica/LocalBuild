-- 040_session_dashboard_repair.sql
-- Phase 7 browser-test repair. Migrations 001-039 are not modified.
--
-- Fixes one real database-level gap found by browser testing: a customer
-- with an existing booking had no way to read that booking's expert's
-- name/headline/photo once the expert later became unpublished --
-- get_expert_profile_public() (031) intentionally returns nothing for a
-- non-published slug, which is correct for the public directory but wrong
-- for an existing booking, which must keep showing the expert it was
-- actually booked with regardless of the expert's current publish state.
--
-- The other two reported bugs (expert dashboard showing the wrong
-- identity, and an awaiting_payment booking visible to the expert) are
-- NOT RLS gaps -- bookings_select_own_expert (039) already correctly
-- restricts itself to confirmed/completed rows for the caller's own
-- expert_profile_id. They are application-layer bugs: the Phase 7 data
-- functions ran a bare `select *` against `bookings` and trusted RLS
-- alone to scope the result, but Postgres OR's every permissive SELECT
-- policy together -- for a dual-identity account (customer on some
-- bookings, expert on others), bookings_select_own (no status filter at
-- all) legitimately added the caller's OWN customer bookings, in ANY
-- status, into what was meant to be an expert-only query. Fixed in
-- lib/expert/sessions.ts and lib/dashboard/data.ts by adding explicit
-- application-layer filters (expert_profile_id = ..., booking_status IN
-- (...), customer_id = ...) alongside RLS, per this migration's sibling
-- code changes -- no database change was needed for that half of the fix.

-- =========================================================================
-- get_expert_context_for_booking() -- the customer-side mirror of
-- get_customer_context_for_booking() (039). The ONLY way a customer reads
-- any expert_profiles data for a booking they own, gated purely on
-- booking ownership (customer_id = auth.uid()), NOT on the expert's
-- current application_status/profile_status -- an existing booking must
-- keep showing its expert even if that expert is later suspended or
-- unpublished. Returns only what a session view needs: name, headline,
-- the raw photo storage path (resolved to a signed URL by the app layer,
-- same as every other expert-photo read in this codebase), and the
-- public slug (for a "View public profile" link where one still applies)
-- -- never short_bio/expertise_summary/career_highlights/pricing/any
-- other application field.
-- =========================================================================
create or replace function public.get_expert_context_for_booking(p_booking_id uuid)
returns table(
  full_name text,
  headline text,
  profile_image_path text,
  slug text
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_customer_id uuid;
  v_booking public.bookings%rowtype;
begin
  v_customer_id := auth.uid();
  if v_customer_id is null then
    return;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return;
  end if;

  if v_booking.customer_id <> v_customer_id then
    return;
  end if;

  return query
    select p.full_name, ep.headline, ep.profile_image_path, ep.slug
    from public.expert_profiles ep
    join public.profiles p on p.id = ep.user_id
    where ep.id = v_booking.expert_profile_id;
end;
$$;

comment on function public.get_expert_context_for_booking(uuid) is
  'The only way a customer reads expert_profiles data for a booking they own, regardless of the expert''s current publish status. Re-validates booking.customer_id = auth.uid() internally. Returns only full_name, headline, profile_image_path, slug -- never any other application field. Returns zero rows for any booking that is not the caller''s own, indistinguishable from a booking that does not exist.';

revoke execute on function public.get_expert_context_for_booking(uuid) from public, anon;
grant execute on function public.get_expert_context_for_booking(uuid) to authenticated;

-- =========================================================================
-- Storage: let the OWNING CUSTOMER of a booking read that expert's photo,
-- regardless of publish status -- same gap as the function above, just
-- for the photo object instead of the profile_image_path column. Mirrors
-- is_published_expert_photo()'s pattern (017_expert_photo_public_fix.sql)
-- exactly, but the predicate is booking ownership instead of publish
-- status.
-- =========================================================================
create or replace function public.is_booked_expert_photo(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.expert_profiles ep on ep.id = b.expert_profile_id
    where ep.profile_image_path = object_name
      and b.customer_id = auth.uid()
  );
$$;

revoke execute on function public.is_booked_expert_photo(text) from public, anon;
grant execute on function public.is_booked_expert_photo(text) to authenticated;

create policy "expert_photo_select_booked_customer"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'expert-profile-images'
    and public.is_booked_expert_photo(storage.objects.name)
  );
