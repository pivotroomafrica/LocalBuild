import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Waitlist mode (070): while platform_settings.waitlist_mode is on, every
 * request outside OPEN_PREFIXES is served the /waitlist page instead
 * (a server-side rewrite, so typing a link, refreshing or an old bookmark
 * all land there). Admins see the whole site. The database separately
 * refuses new bookings from non-admins, so the site can't be used by
 * calling its code directly either.
 */

/** Still reachable during the waitlist. */
const OPEN_PREFIXES = [
  "/waitlist",
  // Sign in / sign up, so experts and admins can get in.
  "/auth",
  // Expert AI onboarding, application and (once approved) dashboard.
  "/expert",
  "/api/expert",
  // Existing bookings keep working from the links in their emails.
  "/dashboard/sessions",
  // Background services: payment confirmations, email/calendar jobs.
  "/api/jobs",
  "/api/payments",
  // Legal pages and static data the open pages use.
  "/terms",
  "/privacy",
  "/geo",
  "/flags",
  "/fonts",
  "/robots.txt",
  "/sitemap.xml",
];

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isOpenDuringWaitlist(pathname: string): boolean {
  return OPEN_PREFIXES.some((prefix) => matches(pathname, prefix));
}

// The switch is read at most every 10 seconds per server process, so a
// change in Admin takes effect within seconds without a database call on
// every page view.
const MODE_TTL_MS = 10_000;
let cachedMode: { on: boolean; at: number } | null = null;

export async function waitlistModeOn(supabase: SupabaseClient): Promise<boolean> {
  if (cachedMode && Date.now() - cachedMode.at < MODE_TTL_MS) return cachedMode.on;
  const { data, error } = await supabase.rpc("waitlist_mode");
  // If it can't be read, keep the last known value (or off): the database
  // still refuses bookings while it is on.
  if (error) return cachedMode?.on ?? false;
  cachedMode = { on: data === true, at: Date.now() };
  return cachedMode.on;
}

/** Called after an admin flips the switch, so this process sees it at once. */
export function forgetWaitlistMode() {
  cachedMode = null;
}

const adminCache = new Map<string, { admin: boolean; at: number }>();

export async function isAdminUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const hit = adminCache.get(userId);
  if (hit && Date.now() - hit.at < 30_000) return hit.admin;
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const admin = data?.role === "admin";
  if (adminCache.size > 500) adminCache.clear();
  adminCache.set(userId, { admin, at: Date.now() });
  return admin;
}
