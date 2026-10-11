-- 047a: logged-out visitors may read active expert categories.
-- Part of the V2 pricing/visibility change; rationale in 047b.

-- 4. Categories readable by logged-out visitors ----------------------------

alter policy expert_categories_select_active on public.expert_categories to anon, authenticated;
grant select on public.expert_categories to anon;
