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

/** Phase 10 (spec sections 54-56) -- reuses the SAME event id, never
 * creates a second event. Only start/end move; attendees and Meet
 * (where present) are unchanged. */
export type UpdateEventParams = {
  eventId: string;
  startAt: string;
  endAt: string;
};

export type UpdateEventResult = { ok: true } | { ok: false; error: string };

/** Phase 10 (spec sections 57-58) -- cancels/deletes the existing event.
 * Never creates a replacement. */
export type CancelEventParams = {
  eventId: string;
};

export type CancelEventResult = { ok: true } | { ok: false; error: string };

export interface CalendarProvider {
  createEvent(params: CreateEventParams): Promise<CreateEventResult>;
  updateEvent(params: UpdateEventParams): Promise<UpdateEventResult>;
  cancelEvent(params: CancelEventParams): Promise<CancelEventResult>;
}
