import { COUNTRY_TIMEZONES } from "@/lib/geo/countryTimezones";

/**
 * Country -> time zone for clients booking from anywhere. They pick a
 * country (with flags); one-zone countries need nothing more, and the few
 * big ones get a short list of cities with the time there now -- never
 * "GMT-5".
 */

/** Not in the IANA list (no ISO code) but uses Central European time. */
const EXTRA: Record<string, string[]> = { XK: ["Europe/Belgrade"] };

export const ADDIS = "Africa/Addis_Ababa";

export function zonesForCountry(code: string): string[] {
  return COUNTRY_TIMEZONES[code] ?? EXTRA[code] ?? [];
}

export function countryOfZone(zone: string | undefined): string | null {
  if (!zone) return null;
  for (const [code, zones] of Object.entries({ ...COUNTRY_TIMEZONES, ...EXTRA })) {
    if (zones.includes(zone)) return code;
  }
  return null;
}

/** Minutes ahead of UTC right now (changes with daylight saving). */
function offsetMinutes(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes())) / 60000);
}

export const cityOf = (zone: string) => zone.split("/").pop()!.replace(/_/g, " ");

export function timeNowIn(zone: string, at: Date = new Date()): string {
  return at.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
}

export type ZoneChoice = { zone: string; city: string; now: string };

/** Best-known cities first; anything else keeps the IANA list order. */
const WELL_KNOWN = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Toronto", "America/Vancouver", "America/Edmonton",
  "America/Winnipeg", "America/Halifax", "America/St_Johns", "Australia/Sydney", "Australia/Melbourne",
  "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth", "Australia/Darwin", "Europe/Moscow",
  "America/Sao_Paulo", "America/Mexico_City", "Asia/Jakarta", "Africa/Kinshasa", "Africa/Lubumbashi",
  "Asia/Almaty", "America/Santiago", "Europe/Madrid", "Atlantic/Canary", "Europe/Lisbon", "Pacific/Auckland",
];
const rank = (zone: string) => {
  const i = WELL_KNOWN.indexOf(zone);
  return i === -1 ? WELL_KNOWN.length : i;
};

/**
 * One choice per clock that's different right now, labelled by the main
 * city for it (zone.tab lists the main zone first), east to west.
 */
export function zoneChoices(code: string, at: Date = new Date()): ZoneChoice[] {
  const byOffset = new Map<number, string>();
  for (const zone of zonesForCountry(code)) {
    const offset = offsetMinutes(zone, at);
    const current = byOffset.get(offset);
    // Label each clock by the city people know best when several share it.
    if (!current || rank(zone) < rank(current)) byOffset.set(offset, zone);
  }
  return [...byOffset.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, zone]) => ({ zone, city: cityOf(zone), now: timeNowIn(zone, at) }));
}

/** Same clock right now as the other zone (e.g. Nairobi and Addis Ababa). */
export function sameClock(a: string, b: string, at: Date = new Date()): boolean {
  return offsetMinutes(a, at) === offsetMinutes(b, at);
}
