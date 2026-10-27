-- 010a_expert_category_index.sql (applied to the demo project as
-- 011_expert_category_index on 2026-09-06; recovered into the repo).

create index if not exists expert_profile_categories_category_id_idx on public.expert_profile_categories (category_id);
