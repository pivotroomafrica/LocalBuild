-- 022_retire_weekly_availability_model.sql
-- Phase 4 adjustment: Pivotroom's actual product model is NOT "what hours
-- do you work every week" -- it's "give Pivotroom 1-5 hours a month, on
-- whatever cadence works for you." The weekly Monday-Sunday recurring
-- schedule from 019_expert_availability_tables.sql /
-- 021_expert_availability_functions.sql is retired in favor of a monthly
-- model (023-025). Migrations 001-021 are not modified -- this is a new,
-- append-only migration that drops objects those migrations created.
--
-- Safety check performed before writing this migration (see the
-- completion report for the exact query and result): live PIVOTROOM-DEMO
-- has ZERO rows in expert_availability_windows, expert_availability_
-- settings, and expert_unavailable_dates. The weekly UI was built but
-- never clicked through in a real browser session by any user, so there
-- is no real data to lose. Nothing here would be safe to run against a
-- project that actually had rows in expert_availability_windows.
--
-- expert_availability_settings (timezone) and expert_unavailable_dates
-- are KEPT AND REUSED as-is -- both already cleanly represent exactly
-- what the monthly model still needs (spec sections 23, 25): one
-- timezone per expert, and a set of fully-blocked dates. Their table
-- structure does not change; only their semantics gain a "skip a
-- recurring occurrence too" meaning, documented on the tables directly
-- below.

-- The old weekly RPC operated on expert_availability_windows -- it goes
-- with the table it wrote to. resolve_own_approved_expert_profile_id()
-- and add_expert_unavailable_date()/remove_expert_unavailable_date() are
-- untouched: they don't reference expert_availability_windows at all and
-- remain exactly as useful to the monthly model as they were to the
-- weekly one.
drop function if exists public.save_expert_availability_schedule(text, jsonb);

-- Table drop cascades its own indexes, CHECK constraints, and the
-- set_expert_availability_windows_updated_at /
-- prevent_expert_availability_windows_overlap triggers automatically.
drop table if exists public.expert_availability_windows;

-- The trigger function itself is not a table-owned object, so it survives
-- the table drop and needs its own cleanup.
drop function if exists public.prevent_expert_availability_window_overlap();

comment on table public.expert_availability_settings is
  'One row per expert: their IANA timezone. Shared by both the monthly recurring rules (expert_monthly_availability_rules, 023) and one-off availability (expert_one_off_availability, 023), which both store local wall-clock time interpreted in this zone. Reused unchanged from the retired weekly model (019_expert_availability_tables.sql) -- this table always only ever stored a timezone, nothing weekly-specific.';

comment on table public.expert_unavailable_dates is
  'A date the expert is fully unavailable, overriding BOTH the monthly recurring rules and any one-off availability for that date (023). Reused unchanged from the retired weekly model -- "full-day exception" was always the correct semantics; only what it overrides has changed from a weekly schedule to a monthly one.';
