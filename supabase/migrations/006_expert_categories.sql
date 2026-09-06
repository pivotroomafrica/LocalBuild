-- 006_expert_categories.sql
-- Controlled list of expertise categories an expert selects from. This is
-- NOT the same concept as the customer-facing `industries` table (e.g. an
-- expert whose industry is "Manufacturing" might offer expertise in
-- "Leadership, Management & Operations") -- kept as separate tables on
-- purpose, never merged.

create table public.expert_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint expert_categories_name_length check (char_length(trim(name)) between 1 and 100),
  constraint expert_categories_slug_length check (char_length(slug) between 1 and 100)
);

comment on table public.expert_categories is
  'Admin-controlled list of expertise categories. Applicants may read active rows but never write to this table.';

alter table public.expert_categories enable row level security;
-- Policies (read-only, active rows) live in 010_expert_rls.sql.
