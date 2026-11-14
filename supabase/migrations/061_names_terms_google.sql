-- 061_names_terms_google.sql
--
-- Sign-up asks for first, middle (optional) and last name, needs the
-- Terms and Privacy Policy accepted, and can use Google.
--
-- 1. profiles.first_name / middle_name / last_name. full_name stays the
--    one name everything else reads (dashboards, emails, admin), built
--    from the parts at sign-up.
-- 2. profiles.terms_accepted_at: when they agreed to the Terms and
--    Privacy Policy. Set at sign-up (email) or on the "Finish your
--    profile" step (Google), only through accept_platform_terms(), so the
--    time is always the server's.
-- 3. handle_new_user() fills the new columns from sign-up data, and from
--    Google's given/family name for Google accounts.
--
-- Non-destructive: three nullable columns, one timestamp, one function,
-- one replaced trigger function.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists terms_accepted_at timestamptz;

alter table public.profiles drop constraint if exists profiles_name_parts_length;
alter table public.profiles add constraint profiles_name_parts_length check (
  coalesce(char_length(first_name), 0) <= 50
  and coalesce(char_length(middle_name), 0) <= 50
  and coalesce(char_length(last_name), 0) <= 50
);

-- Users may correct their own name parts (the "Finish your profile" step);
-- terms_accepted_at is not client-writable.
grant update (first_name, middle_name, last_name) on public.profiles to authenticated;

create or replace function public.accept_platform_terms()
returns void
language sql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
  update public.profiles
     set terms_accepted_at = coalesce(terms_accepted_at, now())
   where id = auth.uid();
$function$;

revoke execute on function public.accept_platform_terms() from public, anon;
grant execute on function public.accept_platform_terms() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first text := left(nullif(trim(coalesce(v_meta ->> 'first_name', v_meta ->> 'given_name')), ''), 50);
  v_middle text := left(nullif(trim(v_meta ->> 'middle_name'), ''), 50);
  v_last text := left(nullif(trim(coalesce(v_meta ->> 'last_name', v_meta ->> 'family_name')), ''), 50);
  v_full text;
begin
  v_full := coalesce(
    nullif(trim(v_meta ->> 'full_name'), ''),
    nullif(trim(concat_ws(' ', v_first, v_middle, v_last)), ''),
    nullif(trim(v_meta ->> 'name'), ''),
    split_part(new.email, '@', 1),
    'Pivotroom Customer'
  );

  insert into public.profiles (id, full_name, first_name, middle_name, last_name, phone, country, city, terms_accepted_at)
  values (
    new.id,
    left(v_full, 100),
    v_first,
    v_middle,
    v_last,
    nullif(trim(v_meta ->> 'phone'), ''),
    left(nullif(trim(v_meta ->> 'country'), ''), 100),
    left(nullif(trim(v_meta ->> 'city'), ''), 100),
    -- Email sign-up sends this only when the box was ticked; Google users
    -- accept on the "Finish your profile" step instead.
    case when v_meta ? 'terms_accepted' then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
