-- "Continue with LinkedIn" (and other OAuth providers) send the person's
-- name as `name` or as given/family names rather than our form's
-- `full_name`. Use whichever is present before falling back to the email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, full_name, phone, country, city)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(concat_ws(' ', new.raw_user_meta_data ->> 'given_name', new.raw_user_meta_data ->> 'family_name')), ''),
      split_part(new.email, '@', 1),
      'Pivotroom Customer'
    ), 100),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    left(nullif(trim(new.raw_user_meta_data ->> 'country'), ''), 100),
    left(nullif(trim(new.raw_user_meta_data ->> 'city'), ''), 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
