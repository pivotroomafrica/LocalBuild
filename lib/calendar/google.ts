import type { CalendarProvider, CreateEventParams, CreateEventResult } from "./provider";
import { getGoogleClientId, getGoogleClientSecret, getGoogleRefreshToken, getGoogleCalendarId } from "./config";

/**
 * Production Calendar client -- the only place in this codebase that
 * makes a real HTTP call to googleapis.com. Endpoints/fields as
 * researched during Phase 9 build (developers.google.com was blocked
 * from this sandbox -- see lib/calendar/config.ts's doc comment and the
 * Phase 9 completion report's "Google docs research" section).
 * Re-verify against Google's current official docs before relying on
 * this in production.
 *
 * Token refresh: POST https://oauth2.googleapis.com/token
 *   grant_type=refresh_token, client_id, client_secret, refresh_token
 *   -> { access_token, expires_in }
 *
 * Event creation: POST https://www.googleapis.com/calendar/v3/calendars/
 *   {calendarId}/events?conferenceDataVersion=1&sendUpdates=all
 *   Authorization: Bearer <access_token>
 *   Body: { summary, description, start: {dateTime, timeZone: "UTC"},
 *           end: {dateTime, timeZone: "UTC"}, attendees: [{email}, ...],
 *           conferenceData?: { createRequest: { requestId,
 *             conferenceSolutionKey: { type: "hangoutsMeet" } } } }
 *
 * conferenceDataVersion=1 is required for Google to honor
 * conferenceData at all (spec section 23) -- omitted entirely (not just
 * left undefined) for in-person bookings, so there is no code path that
 * could accidentally request a Meet link for one (spec section 24).
 *
 * sendUpdates=all makes Google actually email the invite to both
 * attendees, which is what "Invite Customer"/"Invite Expert" (spec
 * section 1) means in practice -- Pivotroom's own confirmation email is
 * separate and intentionally not a duplicate of this (spec section 57).
 */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 30_000) {
    return cachedAccessToken.token;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      refresh_token: getGoogleRefreshToken(),
    }),
  });

  const json = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;

  if (!response.ok || !json?.access_token) {
    throw new Error(json?.error_description ?? json?.error ?? `Google token refresh failed (HTTP ${response.status}).`);
  }

  cachedAccessToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3000) * 1000 };
  return json.access_token;
}

type GoogleEventResponse = {
  id?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  error?: { message?: string };
};

export class GoogleCalendarProvider implements CalendarProvider {
  async createEvent(params: CreateEventParams): Promise<CreateEventResult> {
    try {
      const accessToken = await getAccessToken();
      const calendarId = encodeURIComponent(getGoogleCalendarId());
      const query = params.wantsMeet
        ? "?conferenceDataVersion=1&sendUpdates=all"
        : "?sendUpdates=all";

      const body: Record<string, unknown> = {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.startAt, timeZone: "UTC" },
        end: { dateTime: params.endAt, timeZone: "UTC" },
        attendees: params.attendeeEmails.map((email) => ({ email })),
      };
      if (params.wantsMeet) {
        body.conferenceData = {
          createRequest: {
            // Stable per-booking id (spec section 48): a retried call for
            // the SAME booking reference reuses the same requestId, so a
            // request that timed out after Google may have already
            // processed it does not create a second conference.
            requestId: params.bookingReference,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      const response = await fetch(`${CALENDAR_BASE_URL}/calendars/${calendarId}/events${query}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = (await response.json().catch(() => null)) as GoogleEventResponse | null;

      if (!response.ok || !json?.id) {
        return { ok: false, error: json?.error?.message ?? `Google Calendar event creation failed (HTTP ${response.status}).` };
      }

      const meetingUrl = params.wantsMeet
        ? (json.hangoutLink ?? json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? null)
        : null;

      return { ok: true, eventId: json.id, meetingUrl };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown error contacting Google Calendar." };
    }
  }
}
