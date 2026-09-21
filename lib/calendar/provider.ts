/**
 * Provider abstraction (spec section 69) -- same pattern as
 * lib/email/provider.ts / lib/chapa/client.ts.
 */
export type CreateEventParams = {
  bookingReference: string;
  /** ISO 8601 UTC instants -- exactly bookings.start_at/end_at, never
   * recalculated from a display string (spec section 25). */
  startAt: string;
  endAt: string;
  summary: string;
  description: string;
  attendeeEmails: string[];
  /** true only for session_format = 'online' (spec sections 23, 24) --
   * false never requests conferenceData, so no Meet link is ever
   * generated for an in-person booking. */
  wantsMeet: boolean;
};

export type CreateEventResult =
  | { ok: true; eventId: string; meetingUrl: string | null }
  | { ok: false; error: string };

export interface CalendarProvider {
  createEvent(params: CreateEventParams): Promise<CreateEventResult>;
}
