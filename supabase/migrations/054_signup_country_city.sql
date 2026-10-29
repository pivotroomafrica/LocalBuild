-- Sign-up now asks for country and city (components/ui/CountryCityFields).
-- They arrive in raw_user_meta_data next to full_name and phone.
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
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1),
      'Pivotroom Customer'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    left(nullif(trim(new.raw_user_meta_data ->> 'country'), ''), 100),
    left(nullif(trim(new.raw_user_meta_data ->> 'city'), ''), 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
