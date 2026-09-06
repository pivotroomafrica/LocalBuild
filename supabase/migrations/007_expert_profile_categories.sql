-- 007_expert_profile_categories.sql
-- Join table: which expertise categories an expert applicant has selected.
-- V1 caps this at 3 per expert profile, enforced here at the database
-- level (not just in the UI) via a trigger, since a plain CHECK
-- constraint cannot count sibling rows.

create table public.expert_profile_categories (
  id uuid primary key default gen_random_uuid(),
  expert_profile_id uuid not null references public.expert_profiles (id) on delete cascade,
  category_id uuid not null references public.expert_categories (id),
  created_at timestamptz not null default now(),

  constraint expert_profile_categories_unique unique (expert_profile_id, category_id)
);

comment on table public.expert_profile_categories is
  'Which expertise categories an expert applicant selected. Capped at 3 per expert_profile_id by enforce_expert_category_limit().';

-- expert_profile_id already has a covering index from the unique
-- constraint above; category_id does not, and is joined against
-- expert_categories on every category listing.
create index expert_profile_categories_category_id_idx on public.expert_profile_categories (category_id);

alter table public.expert_profile_categories enable row level security;
-- Policies live in 010_expert_rls.sql.

create or replace function public.enforce_expert_category_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  existing_count integer;
begin
  select count(*) into existing_count
  from public.expert_profile_categories
  where expert_profile_id = new.expert_profile_id;

  if existing_count >= 3 then
    raise exception 'An expert profile may have at most 3 expertise categories.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger expert_profile_categories_limit
  before insert on public.expert_profile_categories
  for each row
  execute function public.enforce_expert_category_limit();

revoke execute on function public.enforce_expert_category_limit() from public, anon, authenticated;
