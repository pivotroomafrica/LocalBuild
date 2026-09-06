-- 002_industries.sql
-- Controlled list of industries. Customers select one; the value is never
-- free text (see customer_profiles.industry_id in 003_customer_profiles.sql).

create table public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint industries_name_length check (char_length(trim(name)) between 1 and 100),
  constraint industries_slug_length check (char_length(slug) between 1 and 100)
);

comment on table public.industries is
  'Admin-controlled list of industries customers can select from. Customers may read active rows but never write to this table.';

alter table public.industries enable row level security;
-- Policies (read-only, active rows) live in 004_customer_rls.sql.
