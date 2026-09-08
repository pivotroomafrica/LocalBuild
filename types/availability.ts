import type { Tables } from "@/types/database";

export type ExpertAvailabilitySettings = Tables<"expert_availability_settings">;
export type ExpertMonthlyAvailabilityRule = Tables<"expert_monthly_availability_rules">;
export type ExpertOneOffAvailability = Tables<"expert_one_off_availability">;
export type ExpertUnavailableDate = Tables<"expert_unavailable_dates">;

/** V1's closed recurrence vocabulary (spec section 29 -- no generic RRULE
 * system). Matches the `week_of_month` CHECK constraint on
 * expert_monthly_availability_rules (023_expert_monthly_availability_tables.sql). */
export const WEEK_OF_MONTH_VALUES = ["first", "second", "third", "fourth", "last"] as const;
export type WeekOfMonth = (typeof WEEK_OF_MONTH_VALUES)[number];

export const WEEK_OF_MONTH_LABELS: Record<WeekOfMonth, string> = {
  first: "First",
  second: "Second",
  third: "Third",
  fourth: "Fourth",
  last: "Last",
};

/** ISO-style day numbering (1 = Monday ... 7 = Sunday), matching
 * expert_monthly_availability_rules.day_of_week. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type DayOfWeek = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<DayOfWeek, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/** Fallback when the browser's own timezone can't be detected (spec
 * section 4/10, carried over from the original Phase 4 timezone
 * architecture) -- never inferred from country/city, no geocoding. */
export const DEFAULT_TIMEZONE = "Africa/Addis_Ababa";

/** Pivotroom's 1-5 hour/month product policy (spec section 16). Hard cap
 * on recurring rules only -- one-off availability is informational, not
 * capped (spec section 18's documented simplification). */
export const MAX_RECURRING_MONTHLY_MINUTES = 300;
export const RECOMMENDED_MIN_MONTHLY_MINUTES = 60;

/** One recurring monthly rule as edited in the UI and sent to
 * add/update_expert_monthly_rule() -- "HH:MM" strings on a 15-minute
 * grid. */
export type MonthlyRuleInput = {
  week_of_month: WeekOfMonth;
  day_of_week: DayOfWeek;
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
