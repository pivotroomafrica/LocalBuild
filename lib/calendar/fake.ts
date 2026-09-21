import type { CalendarProvider, CreateEventParams, CreateEventResult } from "./provider";
import { getCalendarMockScenario, recordCreatedEvent } from "./mockControl";

/**
 * Test-only implementation of CalendarProvider (spec section 69) --
 * selected by getCalendarProvider() (factory.ts) only when
 * INTEGRATIONS_MODE=mock. Never makes a real network call. Mirrors
 * spec sections 72-73: returns a Meet URL only when wantsMeet is true.
 */
export class FakeCalendarProvider implements CalendarProvider {
  async createEvent(params: CreateEventParams): Promise<CreateEventResult> {
    if (getCalendarMockScenario() === "failure") {
      return { ok: false, error: "Mock Google Calendar: simulated event creation failure." };
    }

    const eventId = `mock-event-${params.bookingReference}`;
    const meetingUrl = params.wantsMeet ? `https://meet.google.com/mock-${params.bookingReference.toLowerCase()}` : null;

    recordCreatedEvent({
      bookingReference: params.bookingReference,
      eventId,
      meetingUrl,
      attendeeEmails: params.attendeeEmails,
    });

    return { ok: true, eventId, meetingUrl };
  }
}
