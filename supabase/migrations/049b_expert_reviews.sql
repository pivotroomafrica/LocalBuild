-- 049b_expert_reviews.sql
--
-- "After the session" reviews (website redesign).
--
-- A customer can review a booking once, only after it has really happened:
-- the booking is theirs, paid (confirmed/completed) and its end time has
-- passed. Nothing marks bookings 'completed' yet, so "happened" is
-- confirmed/completed + end_at < now() everywhere in 049.
--
-- Writes only go through submit_expert_review() (SECURITY DEFINER, checks
-- every rule above); there is no insert policy. Admins can hide a review.
-- Visitors read published reviews through get_expert_reviews_public(),
-- which exposes the reviewer's first name and last initial only.

create table if not exists public.expert_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 10 and 1000),
  is_hidden boolean not null default false,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expert_reviews_expert_idx on public.expert_reviews (expert_profile_id, created_at desc);
create index if not exists expert_reviews_customer_idx on public.expert_reviews (customer_id);
create index if not exists expert_reviews_hidden_by_idx on public.expert_reviews (hidden_by);

alter table public.expert_reviews enable row level security;

create policy expert_reviews_select_own on public.expert_reviews
  for select to authenticated
  using (
    customer_id = (select auth.uid())
    or expert_profile_id in (select ep.id from public.expert_profiles ep where ep.user_id = (select auth.uid()))
    or (select public.is_admin())
  );

create policy expert_reviews_update_admin on public.expert_reviews
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.expert_reviews from anon, authenticated;
grant select on public.expert_reviews to authenticated;
grant update (is_hidden, hidden_by, updated_at) on public.expert_reviews to authenticated;

comment on table public.expert_reviews is
  'One review per completed booking. Written only via submit_expert_review(); hidden by admins via is_hidden.';

create or replace function public.submit_expert_review(p_booking_reference text, p_rating integer, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to leave a review.' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where booking_reference = p_booking_reference;
  if not found or v_booking.customer_id <> v_uid then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_booking.booking_status not in ('confirmed', 'completed') or v_booking.end_at > now() then
    raise exception 'You can review a session once it has taken place.' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Choose a rating from 1 to 5.' using errcode = '22023';
  end if;
  if char_length(v_body) < 10 or char_length(v_body) > 1000 then
    raise exception 'Write between 10 and 1,000 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from public.expert_reviews where booking_id = v_booking.id) then
    raise exception 'You have already reviewed this session.' using errcode = '23505';
  end if;

  insert into public.expert_reviews (booking_id, expert_profile_id, customer_id, rating, body)
  values (v_booking.id, v_booking.expert_profile_id, v_uid, p_rating, v_body)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_expert_review(text, integer, text) from public, anon;
grant execute on function public.submit_expert_review(text, integer, text) to authenticated;

create or replace function public.get_expert_reviews_public(p_slug text)
returns table (
  rating smallint,
  body text,
  reviewer_name text,
  duration_minutes integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.rating,
    r.body,
    -- "Abel T." -- never the full name.
    case
      when p.full_name is null or btrim(p.full_name) = '' then 'Pivotroom client'
      when position(' ' in btrim(p.full_name)) = 0 then btrim(p.full_name)
      else split_part(btrim(p.full_name), ' ', 1) || ' '
        || upper(left(regexp_replace(btrim(p.full_name), '^.*\s', ''), 1)) || '.'
    end,
    b.duration_minutes,
    r.created_at
  from public.expert_reviews r
  join public.expert_profiles ep on ep.id = r.expert_profile_id
  join public.bookings b on b.id = r.booking_id
  join public.profiles p on p.id = r.customer_id
  where ep.slug = p_slug and ep.profile_status = 'published' and not r.is_hidden
  order by r.created_at desc
  limit 24;
$$;

revoke execute on function public.get_expert_reviews_public(text) from public;
grant execute on function public.get_expert_reviews_public(text) to anon, authenticated;
