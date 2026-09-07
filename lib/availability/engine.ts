import type { AvailabilityWindowInput, DayOfWeek } from "@/types/availability";

/**
 * Pure availability-calculation logic, deliberately kept out of both React
 * components and Supabase-touching code (spec section 54: "keep the
 * availability calculation layer separate from React components"). Every
 * function here takes already-loaded data and plain values -- no I/O.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):(00|15|30|45)$/;

/**
 * Client-side mirror of the server-side rules in
 * save_expert_availability_schedule() (021_expert_availability_functions.sql):
 * day range, HH:MM on a 15-minute grid, end > start, no overlap within the
 * batch. This exists purely for instant UI feedback -- the RPC is still
 * the actual authority and re-validates everything itself; a bug here can
 * only produce a confusing client-side error, never an unsafe write.
 */
export function validateAvailabilityWindows(
  windows: AvailabilityWindowInput[],
): { valid: true } | { valid: false; error: string } {
  for (const w of windows) {
    if (!TIME_PATTERN.test(w.start_time) || !TIME_PATTERN.test(w.end_time)) {
      return { valid: false, error: "Times must be on a 15-minute increment (e.g. 09:00, 09:15)." };
    }
    if (w.end_time <= w.start_time) {
      return { valid: false, error: "End time must be after start time." };
    }
  }

  const byDay = new Map<DayOfWeek, AvailabilityWindowInput[]>();
  for (const w of windows) {
    const list = byDay.get(w.day_of_week) ?? [];
    list.push(w);
    byDay.set(w.day_of_week, list);
  }

  for (const dayWindows of byDay.values()) {
    const sorted = [...dayWindows].sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].start_time < sorted[i - 1].end_time) {
        return { valid: false, error: "Availability windows overlap for the same day." };
      }
    }
  }

  return { valid: true };
}

/**
 * ISO weekday (1 = Monday ... 7 = Sunday) for a plain "YYYY-MM-DD"
 * calendar-date string. Uses Date.UTC + getUTCDay so the result is pure
 * calendar math, unaffected by the server's own local timezone setting
 * (spec section 55: never assume server timezone = expert timezone).
 * The caller is responsible for having already resolved which LOCAL
 * calendar date, in the expert's own timezone, it wants -- this function
 * only ever answers "what weekday is this calendar date," which has no
 * timezone ambiguity of its own once you already have a Y-M-D string.
 */
export function isoDayOfWeek(localDate: string): DayOfWeek {
  const [year, month, day] = localDate.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay === 0 ? 7 : jsDay) as DayOfWeek;
}

/**
 * Future-booking-engine-compatible query (spec section 53): "for expert
 * X, on local date Y, what open availability windows exist?" Returns the
 * recurring weekly windows for that date's weekday, UNLESS the date is a
 * full-day unavailable exception, in which case it returns none -- the
 * exception always overrides the recurring schedule (spec section 20).
 *
 * Does not touch bookings (none exist yet) and does not generate or
 * persist anything -- purely a read-time calculation over already-loaded
 * settings/windows/unavailable-dates.
 */
export function getAvailabilityForLocalDate(
  windows: AvailabilityWindowInput[],
  unavailableDates: string[],
  localDate: string,
): AvailabilityWindowInput[] {
  if (unavailableDates.includes(localDate)) return [];

  const dayOfWeek = isoDayOfWeek(localDate);
  return windows
    .filter((w) => w.day_of_week === dayOfWeek)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}
