/**
 * The expert's monthly plan (060): hours a month they give Pivotroom, which
 * days (the same weekdays every week, or the same dates every month) and
 * which times. Shared by onboarding and the Availability page; nothing here
 * is server-only.
 */

export type PlanWindow = { start: string; end: string };
export type AvailabilityPlan = {
  /** 2-20; caps booked hours per calendar month. */
  hours: number | null;
  mode: "weekly" | "monthly";
  /** weekly: 0-6 (Sunday = 0); monthly: 1-28. */
  days: number[];
  windows: PlanWindow[];
};

export const HOUR_CHOICES = [2, 4, 6, 8, 10, 15, 20];
export const MIN_PLAN_HOURS = 2;
export const MAX_PLAN_HOURS = 20;

export const TIME_BLOCKS: { key: string; label: string; window: PlanWindow }[] = [
  { key: "morning", label: "Morning", window: { start: "09:00", end: "12:00" } },
  { key: "afternoon", label: "Afternoon", window: { start: "14:00", end: "17:00" } },
  { key: "evening", label: "Evening", window: { start: "18:00", end: "21:00" } },
];

/** Monday first, the way people read a week; values are Postgres dow. */
export const WEEKDAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
];

export const emptyPlan = (): AvailabilityPlan => ({ hours: null, mode: "weekly", days: [], windows: [] });

const hhmm = (time: string) => time.slice(0, 5);
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const windowMinutes = (w: PlanWindow) => Math.max(0, minutes(w.end) - minutes(w.start));

function uniqueWindows(rows: { start_time: string; end_time: string }[]): PlanWindow[] {
  const seen = new Map<string, PlanWindow>();
  for (const row of rows) {
    const w = { start: hhmm(row.start_time), end: hhmm(row.end_time) };
    seen.set(`${w.start}-${w.end}`, w);
  }
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** Read a plan back from the saved rules. Weekly rules win if both exist. */
export function planFromRules(
  hours: number | null,
  weekly: { day_of_week: number; start_time: string; end_time: string }[],
  monthly: { day_of_month: number; start_time: string; end_time: string }[],
): AvailabilityPlan {
  if (weekly.length > 0) {
    return {
      hours,
      mode: "weekly",
      days: [...new Set(weekly.map((r) => r.day_of_week))],
      windows: uniqueWindows(weekly),
    };
  }
  if (monthly.length > 0) {
    return {
      hours,
      mode: "monthly",
      days: [...new Set(monthly.map((r) => r.day_of_month))].sort((a, b) => a - b),
      windows: uniqueWindows(monthly),
    };
  }
  return { ...emptyPlan(), hours };
}

/** Open hours a month the plan creates (weekly: ~4.33 of each weekday). */
export function openHoursPerMonth(plan: AvailabilityPlan): number {
  const perDay = plan.windows.reduce((sum, w) => sum + windowMinutes(w), 0) / 60;
  const occurrences = plan.mode === "weekly" ? plan.days.length * (52 / 12) : plan.days.length;
  return Math.round(perDay * occurrences * 10) / 10;
}

export function windowsOverlap(windows: PlanWindow[]): boolean {
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.some((w, i) => i > 0 && minutes(w.start) < minutes(sorted[i - 1].end));
}

/** Ready to save: hours chosen, a day, a time, nothing overlapping, and at
 * least as much open time as the hours they give. */
export function planProblem(plan: AvailabilityPlan): string | null {
  if (!plan.hours) return "Choose how many hours a month you can give.";
  if (plan.days.length === 0) return plan.mode === "weekly" ? "Pick at least one day of the week." : "Pick at least one date.";
  if (plan.windows.length === 0) return "Pick at least one time of day.";
  if (plan.windows.some((w) => windowMinutes(w) <= 0)) return "Each time needs to end after it starts.";
  if (windowsOverlap(plan.windows)) return "Two of your times overlap.";
  if (openHoursPerMonth(plan) < plan.hours)
    return `That's about ${openHoursPerMonth(plan)} open hours a month, less than the ${plan.hours} you're giving. Add a day or a time.`;
  return null;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const time12 = (t: string) => {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === "00" ? `${hour}${suffix}` : `${hour}:${m}${suffix}`;
};
const joinWords = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** "Every Saturday and Sunday, 9am-12pm" / "The 5th and 20th of every month, 2pm-5pm". */
export function describePlan(plan: AvailabilityPlan): string {
  if (plan.days.length === 0 || plan.windows.length === 0) return "";
  const days =
    plan.mode === "weekly"
      ? `Every ${joinWords(WEEKDAYS.filter((d) => plan.days.includes(d.value)).map((d) => d.long))}`
      : `The ${joinWords([...plan.days].sort((a, b) => a - b).map(ordinal))} of every month`;
  const times = joinWords([...plan.windows].sort((a, b) => a.start.localeCompare(b.start)).map((w) => `${time12(w.start)}–${time12(w.end)}`));
  return `${days}, ${times}`;
}

/** 15-minute steps for the custom time pickers, 06:00-23:00. */
export const TIME_OPTIONS = Array.from({ length: (23 - 6) * 4 + 1 }, (_, i) => {
  const total = 6 * 60 + i * 15;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
});
export const timeLabel = time12;
