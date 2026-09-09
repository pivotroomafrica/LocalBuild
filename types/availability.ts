import type { Tables } from "@/types/database";

export type ExpertAvailabilitySettings = Tables<"expert_availability_settings">;
export type ExpertMonthlyAvailabilityRule = Tables<"expert_monthly_availability_rules">;
export type ExpertAvailabilityOverride = Tables<"expert_availability_overrides">;
export type ExpertOneOffAvailability = Tables<"expert_one_off_availability">;

/** Fallback when the browser's own timezone can't be detected -- never
 * inferred from country/city, no geocoding. */
export const DEFAULT_TIMEZONE = "Africa/Addis_Ababa";

/** Mirrors max_expert_monthly_availability_minutes() in
 * 030_expert_monthly_availability_final_functions.sql -- a client-side
 * constant kept in sync by hand since the DB function is intentionally
 * internal-only (not queryable by the client), so both this constant and
 * the RPC's own enforcement must be updated together if the cap ever
 * changes. Used for BOTH caps described there: the sum of a rule's own
 * durations (Cap A), and one real month's actual total (Cap B). */
export const MAX_RECURRING_MONTHLY_MINUTES = 300;
export const RECOMMENDED_MIN_MONTHLY_MINUTES = 60;

/** Every month has a 1st through 28th unambiguously -- no "there's no
 * Feb 30" edge case to design around (spec section 5). */
export const MIN_DAY_OF_MONTH = 1;
export const MAX_DAY_OF_MONTH = 28;
export const DAY_OF_MONTH_VALUES = Array.from(
  { length: MAX_DAY_OF_MONTH - MIN_DAY_OF_MONTH + 1 },
  (_, i) => i + MIN_DAY_OF_MONTH,
);

/** One recurring monthly rule as edited in the UI and sent to
 * add/update_expert_monthly_rule() -- "HH:MM" strings on a 15-minute
 * grid. */
export type MonthlyRuleInput = {
  day_of_month: number;
  start_time: string;
  end_time: string;
};

/** One specific-date availability window, sent to
 * add/update_expert_one_off_availability(). */
export type OneOffAvailabilityInput = {
  available_date: string; // "YYYY-MM-DD"
  start_time: string;
  end_time: string;
};

export const OVERRIDE_TYPES = ["modified", "skipped"] as const;
export type OverrideType = (typeof OVERRIDE_TYPES)[number];

/** Sent to set_expert_month_override() -- a change to ONE specific
 * month's occurrence of a recurring rule, without rewriting the rule
 * itself. override_date/start_time/end_time are required for "modified"
 * and omitted for "skipped." */
export type MonthOverrideInput = {
  recurring_rule_id: string;
  original_date: string; // "YYYY-MM-DD" -- the natural occurrence being overridden
  override_type: OverrideType;
  override_date?: string;
  start_time?: string;
  end_time?: string;
};

/** One rule's resolved occurrence for one real calendar month --
 * computed on the fly from the rule + any override for that exact
 * occurrence, never stored as a row (spec: do not persist every future
 * occurrence). "displayDate" is the date it actually happens on: equal
 * to originalDate unless status is "modified", in which case it's the
 * override's own date (which may fall in a different month than
 * originalDate). */
export type UpcomingOccurrence = {
  ruleId: string;
  originalDate: string;
  status: "regular" | "modified" | "skipped";
  overrideId: string | null;
  displayDate: string;
  start_time: string;
  end_time: string;
};

export type UpcomingMonth = {
  year: number;
  month: number; // 1-12
  label: string; // "October 2026"
  occurrences: UpcomingOccurrence[];
};
