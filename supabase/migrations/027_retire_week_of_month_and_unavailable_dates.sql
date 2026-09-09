-- 027_retire_week_of_month_and_unavailable_dates.sql
-- Phase 4 final adjustment: retires two structures ahead of the final
-- V1 availability model (028-030). Migrations 001-026 are not modified.
--
-- 1. expert_monthly_availability_rules (week_of_month/day_of_week shape,
--    023_expert_monthly_availability_tables.sql) is replaced by a
--    day-of-month shape in 028 -- user testing showed "first Monday" /
--    "fourth Saturday" was confusing; the final model is "the 15th of
--    every month."
--
--    Data safety check performed before writing this migration: this
--    table was NOT empty -- one real row existed (an expert had actually
--    used the live /expert/availability page: "fourth Saturday,
--    15:00-16:00", created 2026-09-08 via the real UI, on the demo
--    applicant account). Per the spec's explicit "STOP and report before
--    destructive migration" instruction, this was reported to the user
--    before proceeding. Decision (user-confirmed): drop it -- this is
--    PIVOTROOM-DEMO's own demo/test applicant account (documented
--    throughout this codebase as fake data only), a week-of-month rule
--    has no exact equivalent in the new day-of-month model (auto-
--    converting it would silently change what date it represents most
--    months), and recreating one rule in the new UI takes seconds.
--
-- 2. expert_unavailable_dates (019_expert_availability_tables.sql,
--    carried forward unchanged through the 022 weekly-model retirement)
--    is superseded entirely by expert_availability_overrides.override_
--    type = 'skipped' (028) -- every "skip" use case that table served
--    is now a per-occurrence override tied to a specific recurring rule.
--    Confirmed empty (0 rows) before dropping. Keeping both would mean
--    two competing, conflicting exception systems -- the spec explicitly
--    warns against this ("there must be ONE authoritative V1 model").
--
-- Kept, unmodified by this migration: expert_availability_settings
-- (timezone -- still exactly what it always was), expert_one_off_
-- availability (still exactly what it always was -- its overlap/cap
-- logic is rewritten in 030 to use the new day-of-month model, but its
-- table shape does not change), resolve_own_approved_expert_profile_id(),
-- validate_availability_time_range(), remove_expert_monthly_rule(uuid)
-- (same signature works unchanged against the new table),
-- remove_expert_one_off_availability(uuid) (untouched).

-- expert_unavailable_dates and its two RPCs.
drop function if exists public.add_expert_unavailable_date(date);
drop function if exists public.remove_expert_unavailable_date(date);
drop table if exists public.expert_unavailable_dates;

-- The old week_of_month/day_of_week monthly rules table, its overlap
-- trigger, its write RPCs, and the date-arithmetic helpers that only
-- existed to resolve a week-of-month rule to a calendar date (the new
-- day-of-month model needs no such resolution -- "the 15th" IS the
-- calendar day, with no ambiguity to compute).
drop function if exists public.add_expert_monthly_rule(text, int, time, time);
drop function if exists public.update_expert_monthly_rule(uuid, text, int, time, time);
drop function if exists public.validate_monthly_rule_fields(text, int);
drop function if exists public.monthly_rule_matches_date(text, smallint, date);
drop function if exists public.is_last_weekday_of_month(date);
drop function if exists public.nth_weekday_of_month(date);
drop table if exists public.expert_monthly_availability_rules;
-- The trigger itself is dropped along with the table above (a trigger is
-- owned by its table); the trigger FUNCTION is a separate object and
-- needs its own explicit drop.
drop function if exists public.prevent_expert_monthly_rule_overlap();
