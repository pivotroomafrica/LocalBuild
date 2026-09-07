-- 011_expert_base_pricing.sql
-- V1 pricing simplification: an expert sets ONE 60-minute base rate and
-- the format(s) they support; every other duration's price is derived
-- from it (see lib/expert/pricing.ts, the single shared formula used by
-- both the live preview and the authoritative server-side calculation
-- in lib/expert/actions.ts's saveSessionPricingAction).
--
-- This is purely additive -- migrations 005-010 are not modified. These
-- three columns become the source of truth for an expert's pricing
-- configuration; expert_session_types (008_expert_session_types.sql)
-- keeps its existing shape and is now a set of rows *derived* from this
-- configuration (one per enabled duration) rather than manually created
-- by the applicant one at a time.

alter table public.expert_profiles
  add column base_hourly_price numeric(12, 2),
  add column online_enabled boolean not null default false,
  add column in_person_enabled boolean not null default false;

alter table public.expert_profiles
  add constraint expert_base_hourly_price_positive
    check (base_hourly_price is null or base_hourly_price > 0);

comment on column public.expert_profiles.base_hourly_price is
  'The expert''s 60-minute session rate (ETB). Source of truth for all derived session-duration prices in expert_session_types -- see lib/expert/pricing.ts.';
comment on column public.expert_profiles.online_enabled is
  'Whether the expert offers sessions online. Mirrored onto every row this expert has in expert_session_types.';
comment on column public.expert_profiles.in_person_enabled is
  'Whether the expert offers sessions in person. Mirrored onto every row this expert has in expert_session_types.';

-- Column-level grant only, added to the existing UPDATE grant from
-- 010_expert_rls.sql (SELECT already covers these columns: the SELECT
-- grant there is table-level, not column-specific, so it automatically
-- covers any column added later). No REVOKE is needed first here --
-- unlike the profiles.role-style hardening in earlier migrations, these
-- are brand-new columns that have never had any privilege granted or
-- revoked before, so there's nothing for an ordering bug to interact
-- with.
grant update (base_hourly_price, online_enabled, in_person_enabled)
  on public.expert_profiles to authenticated;
