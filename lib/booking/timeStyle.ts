/**
 * How a booking time is shown: Ethiopian time (the day counted from 6am,
 * so 14:00 is "8:00 ከሰዓት") or the 12-hour clock (2:00 PM). Ethiopian time
 * is always worked out from Addis Ababa time -- it only exists there.
 * Nothing here is server-only.
 */

export type TimeStyle = "ethiopian" | "12h";

export const ADDIS_TIMEZONE = "Africa/Addis_Ababa";

export type DayPart = "morning" | "afternoon" | "evening" | "night";

export const DAY_PART_LABELS: Record<DayPart, { en: string; am: string }> = {
  morning: { en: "Morning", am: "ጠዋት" },
  afternoon: { en: "Afternoon", am: "ከሰዓት" },
  evening: { en: "Evening", am: "ማታ" },
  night: { en: "Night", am: "ሌሊት" },
};

/** Hour and minute of an instant on a given clock. */
function clock(iso: string, timeZone: string | undefined): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(
    new Date(iso),
  );
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get("hour") % 24, minute: get("minute") };
}

export function dayPartOfHour(hour: number): DayPart {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18) return "evening";
  return "night";
}

/** The clock a style reads from: Ethiopian always uses Addis Ababa. */
export const styleTimeZone = (style: TimeStyle, customerTimeZone: string | undefined) =>
  style === "ethiopian" ? ADDIS_TIMEZONE : customerTimeZone;

export function dayPartOf(iso: string, style: TimeStyle, customerTimeZone: string | undefined): DayPart {
  return dayPartOfHour(clock(iso, styleTimeZone(style, customerTimeZone)).hour);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "8:00" (Ethiopian, no part of day) or "2:00 PM". */
export function formatSlotTime(iso: string, style: TimeStyle, customerTimeZone: string | undefined): string {
  const { hour, minute } = clock(iso, styleTimeZone(style, customerTimeZone));
  if (style === "ethiopian") {
    const ethiopianHour = (hour + 18) % 12 || 12; // 06:00 -> 12, 07:00 -> 1, 14:00 -> 8
    return `${ethiopianHour}:${pad(minute)}`;
  }
  const twelve = hour % 12 || 12;
  return `${twelve}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`;
}

/** "8:00 ከሰዓት" / "2:00 PM" -- with the part of day where Ethiopian needs it. */
export function formatSlotTimeFull(iso: string, style: TimeStyle, customerTimeZone: string | undefined): string {
  const time = formatSlotTime(iso, style, customerTimeZone);
  if (style !== "ethiopian") return time;
  return `${time} ${DAY_PART_LABELS[dayPartOf(iso, style, customerTimeZone)].am}`;
}

export const defaultTimeStyle = (customerTimeZone: string | undefined): TimeStyle =>
  !customerTimeZone || customerTimeZone === ADDIS_TIMEZONE ? "ethiopian" : "12h";

const STORAGE_KEY = "pr-time-style";

export function readStoredTimeStyle(): TimeStyle | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "ethiopian" || value === "12h" ? value : null;
  } catch {
    return null;
  }
}

export function storeTimeStyle(style: TimeStyle) {
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}
