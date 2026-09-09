import type {
  ExpertAvailabilityOverride,
  ExpertMonthlyAvailabilityRule,
  ExpertOneOffAvailability,
  MonthlyRuleInput,
  OneOffAvailabilityInput,
  UpcomingMonth,
  UpcomingOccurrence,
} from "@/types/availability";
import { MAX_RECURRING_MONTHLY_MINUTES } from "@/types/availability";

/**
 * Pure availability-calculation logic, deliberately kept out of both React
 * components and Supabase-touching code -- every function here takes
 * already-loaded data and plain values, no I/O. Mirrors the server-side
 * PL/pgSQL logic in 030_expert_monthly_availability_final_functions.sql
 * (same day-of-month/override precedence, same overlap rules) so
 * client-side feedback never disagrees with what the RPC will actually
 * enforce -- the RPC re-validates authoritatively either way.
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

export function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/** "The 15th of every month" */
export function formatMonthlyRuleLabel(rule: { day_of_month: number }): string {
  return `The ${ordinal(rule.day_of_month)} of every month`;
}

/**
 * Client-side mirror of add/update_expert_monthly_rule()'s recurring vs
 * recurring overlap check -- instant feedback only; the RPC re-validates
 * authoritatively. `excludeIndex` lets an edit-in-place check exclude the
 * rule being edited from the comparison.
 */
export function ruleOverlapsExisting(
  existingRules: MonthlyRuleInput[],
  candidate: MonthlyRuleInput,
  excludeIndex?: number,
): boolean {
  return existingRules.some((r, i) => {
    if (i === excludeIndex) return false;
    if (r.day_of_month !== candidate.day_of_month) return false;
    return r.start_time < candidate.end_time && r.end_time > candidate.start_time;
  });
}

/** Sum of every recurring rule's duration -- Cap A, the "regular monthly
 * commitment" checked at rule create/update time. */
export function getRecurringMonthlyMinutes(rules: MonthlyRuleInput[]): number {
  return rules.reduce((total, r) => total + durationMinutes(r.start_time, r.end_time), 0);
}

export function wouldExceedRecurringCap(existingRules: MonthlyRuleInput[], candidate: MonthlyRuleInput): boolean {
  return (
    getRecurringMonthlyMinutes(existingRules) + durationMinutes(candidate.start_time, candidate.end_time) >
    MAX_RECURRING_MONTHLY_MINUTES
  );
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

/** "YYYY-MM-DD" for a rule's natural occurrence in a given calendar
 * month -- day_of_month is always 1-28, so this is always a real date,
 * no "no such day" case to handle. */
export function occurrenceDateForDayOfMonth(year: number, month: number, dayOfMonth: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function overrideKey(ruleId: string, originalDate: string): string {
  return `${ruleId}|${originalDate}`;
}

/**
 * "What's actually available on this one calendar date?" -- client-side
 * mirror of expert_recurring_and_override_windows_for_date(): a natural
 * rule occurrence landing on localDate with no override for that exact
 * occurrence, plus any modified override (from any rule, any original
 * month) moved TO localDate. Used for one-off and override overlap
 * feedback.
 */
export type RawAvailabilityWindow = { start_time: string; end_time: string };

export function getEffectiveWindowsForDate(
  rules: ExpertMonthlyAvailabilityRule[],
  overrides: ExpertAvailabilityOverride[],
  localDate: string,
  excludeOverrideId?: string,
): RawAvailabilityWindow[] {
  const day = Number(localDate.split("-")[2]);

  const overrideByKey = new Map<string, ExpertAvailabilityOverride>();
  for (const o of overrides) {
    if (excludeOverrideId && o.id === excludeOverrideId) continue;
    overrideByKey.set(overrideKey(o.recurring_rule_id, o.original_date), o);
  }

  const natural = rules
    .filter((r) => r.day_of_month === day && !overrideByKey.has(overrideKey(r.id, localDate)))
    .map((r) => ({ start_time: r.start_time, end_time: r.end_time }));

  const moved = overrides
    .filter(
      (o) =>
        (!excludeOverrideId || o.id !== excludeOverrideId) &&
        o.override_type === "modified" &&
        o.override_date === localDate,
    )
    .map((o) => ({ start_time: o.start_time as string, end_time: o.end_time as string }));

  return [...natural, ...moved];
}

/**
 * The actual, computed total for one real (year, month) calendar month --
 * client-side mirror of expert_month_total_minutes(): unoverridden
 * natural occurrences + modified overrides landing in that month +
 * one-off availability in that month. The exclude options mirror the
 * SQL function's own parameters: excludeOverrideId/excludeOneOffId
 * remove one existing row's own prior contribution (an update replacing
 * itself); excludeRuleId + excludeOriginalDate additionally remove a
 * natural occurrence that is about to gain a brand-new override.
 */
export function getMonthTotalMinutes(
  rules: ExpertMonthlyAvailabilityRule[],
  overrides: ExpertAvailabilityOverride[],
  oneOffs: ExpertOneOffAvailability[],
  year: number,
  month: number,
  options?: {
    excludeOverrideId?: string;
    excludeOneOffId?: string;
    excludeRuleId?: string;
    excludeOriginalDate?: string;
  },
): number {
  const { excludeOverrideId, excludeOneOffId, excludeRuleId, excludeOriginalDate } = options ?? {};

  const overrideByKey = new Map<string, ExpertAvailabilityOverride>();
  for (const o of overrides) {
    if (excludeOverrideId && o.id === excludeOverrideId) continue;
    overrideByKey.set(overrideKey(o.recurring_rule_id, o.original_date), o);
  }

  let total = 0;

  for (const rule of rules) {
    const occurrenceDate = occurrenceDateForDayOfMonth(year, month, rule.day_of_month);
    if (excludeRuleId && rule.id === excludeRuleId && occurrenceDate === excludeOriginalDate) continue;
    if (overrideByKey.has(overrideKey(rule.id, occurrenceDate))) continue;
    total += durationMinutes(rule.start_time, rule.end_time);
  }

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  for (const o of overrides) {
    if (excludeOverrideId && o.id === excludeOverrideId) continue;
    if (o.override_type !== "modified" || !o.override_date) continue;
    if (!o.override_date.startsWith(monthPrefix)) continue;
    total += durationMinutes(o.start_time as string, o.end_time as string);
  }

  for (const f of oneOffs) {
    if (excludeOneOffId && f.id === excludeOneOffId) continue;
    if (!f.available_date.startsWith(monthPrefix)) continue;
    total += durationMinutes(f.start_time, f.end_time);
  }

  return total;
}

export function wouldExceedMonthCap(
  rules: ExpertMonthlyAvailabilityRule[],
  overrides: ExpertAvailabilityOverride[],
  oneOffs: ExpertOneOffAvailability[],
  year: number,
  month: number,
  candidateMinutes: number,
  options?: Parameters<typeof getMonthTotalMinutes>[5],
): boolean {
  return getMonthTotalMinutes(rules, overrides, oneOffs, year, month, options) + candidateMinutes > MAX_RECURRING_MONTHLY_MINUTES;
}

/**
 * "Upcoming Months" (spec: dynamically calculated, never stored as rows)
 * -- for each of the next `monthsAhead` calendar months starting at
 * (startYear, startMonth), resolve every rule's occurrence for that
 * month: "regular" (the rule's natural date/time, unmodified), "skipped"
 * (an override removed it for that month only), or "modified" (an
 * override moved it to a different date/time, possibly a different
 * month than its natural one). Grouped under the occurrence's ORIGINAL
 * month -- the month the base rule places it in -- since that's the
 * month whose Edit/Skip/Restore controls operate on it via
 * (recurring_rule_id, original_date); a "modified" card additionally
 * shows the date/time it was actually moved to.
 */
export function getUpcomingMonths(
  rules: ExpertMonthlyAvailabilityRule[],
  overrides: ExpertAvailabilityOverride[],
  monthsAhead: number,
  startYear: number,
  startMonth: number,
): UpcomingMonth[] {
  const overrideByKey = new Map<string, ExpertAvailabilityOverride>();
  for (const o of overrides) {
    overrideByKey.set(overrideKey(o.recurring_rule_id, o.original_date), o);
  }

  const sortedRules = [...rules].sort(
    (a, b) => a.day_of_month - b.day_of_month || a.start_time.localeCompare(b.start_time),
  );

  const months: UpcomingMonth[] = [];
  let cursor = { year: startYear, month: startMonth };

  for (let i = 0; i < monthsAhead; i += 1) {
    const { year, month } = cursor;

    const occurrences: UpcomingOccurrence[] = sortedRules.map((rule) => {
      const originalDate = occurrenceDateForDayOfMonth(year, month, rule.day_of_month);
      const override = overrideByKey.get(overrideKey(rule.id, originalDate));

      if (!override) {
        return {
          ruleId: rule.id,
          originalDate,
          status: "regular",
          overrideId: null,
          displayDate: originalDate,
          start_time: rule.start_time,
          end_time: rule.end_time,
        };
      }

      if (override.override_type === "skipped") {
        return {
          ruleId: rule.id,
          originalDate,
          status: "skipped",
          overrideId: override.id,
          displayDate: originalDate,
          start_time: rule.start_time,
          end_time: rule.end_time,
        };
      }

      return {
        ruleId: rule.id,
        originalDate,
        status: "modified",
        overrideId: override.id,
        displayDate: override.override_date ?? originalDate,
        start_time: override.start_time ?? rule.start_time,
        end_time: override.end_time ?? rule.end_time,
      };
    });

    months.push({ year, month, label: monthLabel(year, month), occurrences });
    cursor = addMonths(year, month, 1);
  }

  return months;
}
