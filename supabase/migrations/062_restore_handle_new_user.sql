-- Restores handle_new_user() from 061 (names, terms). 059_oauth_profile_names
-- was applied after 061 and replaced it with an older version that dropped
-- first/middle/last name and terms_accepted_at. 061's version already reads
-- OAuth names (given_name/family_name, name), so it covers LinkedIn too.

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
