import type {
  DayOfWeek,
  MonthlyRuleInput,
  OneOffAvailabilityInput,
  WeekOfMonth,
} from "@/types/availability";
import { MAX_RECURRING_MONTHLY_MINUTES } from "@/types/availability";

/**
 * Pure availability-calculation logic, deliberately kept out of both React
 * components and Supabase-touching code (spec section 42: "keep
 * recurrence logic centralized and testable," not duplicated across
 * components). Every function here takes already-loaded data and plain
 * values -- no I/O. Mirrors the server-side PL/pgSQL logic in
 * 025_expert_monthly_availability_functions.sql exactly (same nth-weekday
 * math, same overlap rules) so client-side feedback never disagrees with
 * what the RPC will actually enforce.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/;

export function validateTimeRange(
  startTime: string,
  endTime: string,
): { valid: true } | { valid: false; error: string } {
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return { valid: false, error: "Times must be on a 15-minute increment (e.g. 3:00, 3:15)." };
  }
  if (endTime <= startTime) {
    return { valid: false, error: "End time must be after start time." };
  }
  return { valid: true };
}

export function durationMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0 minutes";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins > 0) parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** "First Monday of every month" */
export function formatMonthlyRuleLabel(rule: { week_of_month: WeekOfMonth; day_of_week: DayOfWeek }): string {
  const weekLabel = rule.week_of_month.charAt(0).toUpperCase() + rule.week_of_month.slice(1);
  const dayLabel = WEEKDAY_NAME[rule.day_of_week];
  return `${weekLabel} ${dayLabel} of every month`;
}

const WEEKDAY_NAME: Record<DayOfWeek, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/** "fourth" and "last" can resolve to the same calendar date (a month
 * with exactly 4 occurrences of that weekday) -- treated as the same
 * recurrence bucket for overlap purposes, mirroring
 * prevent_expert_monthly_rule_overlap() /
 * add_expert_monthly_rule()'s overlap check in
 * 023/025_expert_monthly_availability_*.sql. */
function sameRecurrenceBucket(a: WeekOfMonth, b: WeekOfMonth): boolean {
  if (a === b) return true;
  return (a === "fourth" || a === "last") && (b === "fourth" || b === "last");
}

/**
 * Client-side mirror of add/update_expert_monthly_rule()'s overlap check
 * -- instant feedback only; the RPC re-validates authoritatively.
 * `excludeIndex` lets an edit-in-place check exclude the rule being
 * edited from the comparison.
 */
export function ruleOverlapsExisting(
  existingRules: MonthlyRuleInput[],
  candidate: MonthlyRuleInput,
  excludeIndex?: number,
): boolean {
  return existingRules.some((r, i) => {
    if (i === excludeIndex) return false;
    if (r.day_of_week !== candidate.day_of_week) return false;
    if (!sameRecurrenceBucket(r.week_of_month, candidate.week_of_month)) return false;
    return r.start_time < candidate.end_time && r.end_time > candidate.start_time;
  });
}

/** Sum of every recurring rule's duration -- the value the 5-hour cap
 * (spec section 16) is checked against. Deliberately not weighted by
 * how often "fourth"/"last" might collapse into the same date in a given
 * month (spec section 14: prefer a simple derived sum). */
export function getRecurringMonthlyMinutes(rules: MonthlyRuleInput[]): number {
  return rules.reduce((total, r) => total + durationMinutes(r.start_time, r.end_time), 0);
}

export function wouldExceedMonthlyCap(existingRules: MonthlyRuleInput[], candidate: MonthlyRuleInput): boolean {
  return getRecurringMonthlyMinutes(existingRules) + durationMinutes(candidate.start_time, candidate.end_time) > MAX_RECURRING_MONTHLY_MINUTES;
}

/**
 * Client-side mirror of add/update_expert_one_off_availability()'s
 * same-date overlap check.
 */
export function oneOffOverlapsExisting(
  existingOneOffs: OneOffAvailabilityInput[],
  candidate: OneOffAvailabilityInput,
  excludeIndex?: number,
): boolean {
  return existingOneOffs.some((o, i) => {
    if (i === excludeIndex) return false;
    if (o.available_date !== candidate.available_date) return false;
    return o.start_time < candidate.end_time && o.end_time > candidate.start_time;
  });
}

/**
 * ISO weekday (1 = Monday ... 7 = Sunday) for a plain "YYYY-MM-DD"
 * calendar-date string. Uses Date.UTC + getUTCDay so the result is pure
 * calendar math, unaffected by the server's own local timezone setting
 * (spec section 55 from the original Phase 4 spec, still true here: never
 * assume server timezone = expert timezone). The caller is responsible
 * for having already resolved which LOCAL calendar date, in the expert's
 * own timezone, it wants -- this function only ever answers "what
 * weekday is this calendar date."
 */
export function isoDayOfWeek(localDate: string): DayOfWeek {
  const [year, month, day] = localDate.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
}

/** Which occurrence of its weekday this date is within its month (1-5).
 * Mirrors nth_weekday_of_month() in 025_expert_monthly_availability_functions.sql. */
export function getNthWeekdayOfMonth(localDate: string): number {
  const day = Number(localDate.split("-")[2]);
  return Math.floor((day - 1) / 7) + 1;
}

/** Whether this date is the LAST occurrence of its weekday in its month.
 * Mirrors is_last_weekday_of_month() -- computed by checking whether the
 * same weekday 7 days later falls in the next month. */
export function isLastWeekdayOfMonth(localDate: string): boolean {
  const [year, month, day] = localDate.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  const sevenDaysLater = new Date(Date.UTC(year, month - 1, day + 7));
  return current.getUTCMonth() !== sevenDaysLater.getUTCMonth();
}

/** Does a given local calendar date match a monthly rule's
 * (week_of_month, day_of_week)? Mirrors monthly_rule_matches_date() in
 * 025_expert_monthly_availability_functions.sql exactly. */
export function doesDateMatchMonthlyRule(
  rule: { week_of_month: WeekOfMonth; day_of_week: DayOfWeek },
  localDate: string,
): boolean {
  if (isoDayOfWeek(localDate) !== rule.day_of_week) return false;

  if (rule.week_of_month === "last") return isLastWeekdayOfMonth(localDate);

  const nth = getNthWeekdayOfMonth(localDate);
  const target = { first: 1, second: 2, third: 3, fourth: 4 }[rule.week_of_month as "first" | "second" | "third" | "fourth"];
  return nth === target;
}

export type RawAvailabilityWindow = { start_time: string; end_time: string };

/**
 * Future-booking-engine-compatible query (spec section 41): "for expert
 * X, on local date Y, what raw availability exists?" Precedence (spec
 * section 26): an unavailable date wins outright; otherwise, matching
 * recurring rules plus any one-off availability on that exact date are
 * combined. Does not touch bookings (none exist yet) and does not
 * generate or persist anything -- purely a read-time calculation over
 * already-loaded settings/rules/one-offs/unavailable-dates.
 */
export function getRawAvailabilityForLocalDate(
  monthlyRules: (MonthlyRuleInput & { week_of_month: WeekOfMonth; day_of_week: DayOfWeek })[],
  oneOffs: OneOffAvailabilityInput[],
  unavailableDates: string[],
  localDate: string,
): RawAvailabilityWindow[] {
  if (unavailableDates.includes(localDate)) return [];

  const fromRules = monthlyRules
    .filter((r) => doesDateMatchMonthlyRule(r, localDate))
    .map((r) => ({ start_time: r.start_time, end_time: r.end_time }));

  const fromOneOffs = oneOffs
    .filter((o) => o.available_date === localDate)
    .map((o) => ({ start_time: o.start_time, end_time: o.end_time }));

  return [...fromRules, ...fromOneOffs].sort((a, b) => a.start_time.localeCompare(b.start_time));
}

/**
 * "Actual availability for a specified month" (spec section 44) --
 * iterates every calendar date in the given month and sums the raw
 * availability duration for each, which naturally folds in recurring
 * occurrences that actually land in that month, one-off windows in that
 * month, and unavailable-date overrides, without duplicating any of that
 * logic. No booking subtraction (none exist yet).
 */
export function getAvailabilityMinutesForMonth(
  monthlyRules: (MonthlyRuleInput & { week_of_month: WeekOfMonth; day_of_week: DayOfWeek })[],
  oneOffs: OneOffAvailabilityInput[],
  unavailableDates: string[],
  year: number,
  month: number, // 1-12
): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let total = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const localDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const windows = getRawAvailabilityForLocalDate(monthlyRules, oneOffs, unavailableDates, localDate);
    total += windows.reduce((sum, w) => sum + durationMinutes(w.start_time, w.end_time), 0);
  }
  return total;
}
