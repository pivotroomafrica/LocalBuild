/**
 * Server-only Google Calendar configuration.
 *
 * STRATEGY CHOSEN (spec section 16, documented explicitly as required):
 * a single Pivotroom-owned organizer Google account, authorized ONCE via
 * a normal OAuth 2.0 consent flow (authorization-code grant), with the
 * resulting refresh token stored here as GOOGLE_REFRESH_TOKEN. Every
 * booking's event is created on that one account's calendar, with the
 * customer and expert added as attendees.
 *
 * This was chosen over a service account (Option: domain-wide delegation)
 * because Google Meet conference creation via the Calendar API requires
 * either (a) a real Google account's own OAuth consent, or (b) a service
 * account with Google Workspace domain-wide delegation impersonating a
 * real Workspace user -- confirmed via WebSearch during this phase's
 * research step (developers.google.com itself was blocked from this
 * sandbox, same limitation as Chapa/Resend). Domain-wide delegation
 * requires Pivotroom to be a Google Workspace admin and grant delegation
 * in the Admin Console -- meaningfully more setup than a one-time OAuth
 * consent, for zero V1 benefit (there is exactly one organizer account,
 * never a per-expert one, so there is nothing to impersonate on anyone
 * else's behalf). Per-expert OAuth (Option B in the spec) was rejected
 * for the same reason spec section 16 asks to avoid it: it would need an
 * in-app "Connect your Google Calendar" flow per expert, real OAuth
 * callback security work (state param, redirect URI validation, token
 * storage per expert), for a V1 that only ever needs ONE organizer.
 *
 * The refresh token itself is obtained OUTSIDE this codebase (a one-time
 * OAuth consent screen visit, e.g. via Google's OAuth 2.0 Playground
 * configured with your own GOOGLE_CLIENT_ID/SECRET and the
 * `https://www.googleapis.com/auth/calendar.events` scope) -- there is
 * no in-app OAuth callback route to build for V1, since only this one
 * account ever needs authorizing, not one per user. See the completion
 * report's "WHAT I NEED TO CONFIGURE" for the exact steps.
 */

export function getGoogleClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not configured.");
  return id;
}

export function getGoogleClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not configured.");
  return secret;
}

export function getGoogleRefreshToken(): string {
  const token = process.env.GOOGLE_REFRESH_TOKEN;
  if (!token) throw new Error("GOOGLE_REFRESH_TOKEN is not configured.");
  return token;
}

/** Minimal scope requested (spec section 93) -- calendar.events only,
 * never Gmail/Drive/full calendar management. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** The organizer account's calendar to create events on -- "primary"
 * (that account's own default calendar) unless a specific calendar id is
 * configured. */
export function getGoogleCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

export function isCalendarConfigured(): boolean {
  if (process.env.INTEGRATIONS_MODE === "mock") return true;
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}
