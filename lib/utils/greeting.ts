/** "Good morning" / "Good afternoon" / "Good evening" in Addis Ababa time,
 * where Pivotroom's sessions happen. */
export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Addis_Ababa" }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "today", "tomorrow", "in 3 days" until a future instant. */
export function relativeDays(iso: string, now = new Date()): string {
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(d);
  const diff = Math.round((Date.parse(day(new Date(iso))) - Date.parse(day(now))) / 86_400_000);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}

export function shortDate(iso: string, timeZone: string | null | undefined): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone || "Africa/Addis_Ababa",
  });
}
