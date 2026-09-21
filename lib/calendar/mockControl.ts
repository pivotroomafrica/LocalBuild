/**
 * Test-only, process-scoped state for FakeCalendarProvider -- same
 * pattern as lib/email/mockControl.ts / lib/chapa/mockControl.ts.
 */
export type CalendarMockScenario = "success" | "failure";

export type CreatedEventRecord = {
  bookingReference: string;
  eventId: string;
  meetingUrl: string | null;
  attendeeEmails: string[];
};

let scenario: CalendarMockScenario = "success";
const created: CreatedEventRecord[] = [];

export function setCalendarMockScenario(next: CalendarMockScenario) {
  scenario = next;
}

export function getCalendarMockScenario(): CalendarMockScenario {
  return scenario;
}

export function recordCreatedEvent(record: CreatedEventRecord) {
  created.push(record);
}

export function getCreatedEvents(): CreatedEventRecord[] {
  return created;
}

export function resetCalendarMock() {
  scenario = "success";
  created.length = 0;
}
