-- 070: Waitlist mode.
--
-- One switch (platform_settings.waitlist_mode, off by default) that admins
-- turn on and off from Admin -> Site settings. While it is on, the app
-- shows every visitor the waitlist page instead of the site (enforced in
-- the request proxy), and the database itself refuses new bookings from
-- anyone but an admin, so the site can't be used by calling its code
-- directly either. Nothing existing is changed or removed: switching it
-- off puts the site back exactly as it was.
--
-- Clients on the waitlist leave their details in waitlist_signups (no
-- account). Only join_waitlist() writes there; only admins read it.

alter table public.platform_settings
  add column if not exists waitlist_mode boolean not null default false;

-- Read by the request proxy with the public key on every page view.
create or replace function public.waitlist_mode()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((select waitlist_mode from public.platform_settings where id), false);
$$;
revoke execute on function public.waitlist_mode() from public;
grant execute on function public.waitlist_mode() to anon, authenticated;

-- Admins only.
create or replace function public.set_waitlist_mode(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.platform_settings set waitlist_mode = p_on, updated_at = now() where id;
  return p_on;
end;
$$;
revoke execute on function public.set_waitlist_mode(boolean) from public;
grant execute on function public.set_waitlist_mode(boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Client sign-ups
-- ---------------------------------------------------------------------
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  email_key text not null,
  phone text,
  country text,
  city text,
  interest text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint waitlist_signups_name_length check (char_length(full_name) between 1 and 120),
  constraint waitlist_signups_email_shape check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  constraint waitlist_signups_phone_length check (phone is null or char_length(phone) <= 40),
  constraint waitlist_signups_place_length check (
    (country is null or char_length(country) <= 100) and (city is null or char_length(city) <= 100)
  ),
  constraint waitlist_signups_interest_length check (interest is null or char_length(interest) <= 1000)
);
create unique index if not exists waitlist_signups_email_key on public.waitlist_signups (email_key);
create index if not exists waitlist_signups_created_at on public.waitlist_signups (created_at desc);

alter table public.waitlist_signups enable row level security;

drop policy if exists waitlist_signups_admin_select on public.waitlist_signups;
create policy waitlist_signups_admin_select on public.waitlist_signups
  for select to authenticated using (public.is_admin());

revoke all on public.waitlist_signups from anon, authenticated;
grant select on public.waitlist_signups to authenticated;

-- Returns 'joined' for a new sign-up, 'already' for an email already on
-- the list (its details are left as they were).
create or replace function public.join_waitlist(
  p_full_name text,
  p_email text,
  p_phone text,
  p_country text,
  p_city text,
  p_interest text
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
begin
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  -- A flood guard: at most 300 new sign-ups in any 10 minutes overall.
  if (select count(*) from public.waitlist_signups where created_at > now() - interval '10 minutes') >= 300 then
    raise exception 'busy' using errcode = '53400';
  end if;

  insert into public.waitlist_signups (full_name, email, email_key, phone, country, city, interest)
  values (
    v_name,
    trim(p_email),
    v_email,
    nullif(left(trim(coalesce(p_phone, '')), 40), ''),
    nullif(left(trim(coalesce(p_country, '')), 100), ''),
    nullif(left(trim(coalesce(p_city, '')), 100), ''),
    nullif(left(trim(coalesce(p_interest, '')), 1000), '')
  )
  on conflict (email_key) do nothing;

  return case when found then 'joined' else 'already' end;
end;
$$;
revoke execute on function public.join_waitlist(text, text, text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- No new bookings while the waitlist is on (admins excepted). Existing
-- bookings are untouched and keep working.
-- ---------------------------------------------------------------------
create or replace function public.refuse_bookings_during_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if public.waitlist_mode() and not public.is_admin() then
    raise exception 'Pivotroom is not taking bookings yet. Join the waitlist and we''ll let you know when we open.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_refuse_during_waitlist on public.bookings;
create trigger bookings_refuse_during_waitlist
  before insert on public.bookings
  for each row execute function public.refuse_bookings_during_waitlist();
