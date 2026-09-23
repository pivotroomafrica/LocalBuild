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

export type UpdatedEventRecord = {
  eventId: string;
  startAt: string;
  endAt: string;
};

export type CancelledEventRecord = {
  eventId: string;
};

let scenario: CalendarMockScenario = "success";
const created: CreatedEventRecord[] = [];
const updated: UpdatedEventRecord[] = [];
const cancelled: CancelledEventRecord[] = [];

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

export function recordUpdatedEvent(record: UpdatedEventRecord) {
  updated.push(record);
}

export function getUpdatedEvents(): UpdatedEventRecord[] {
  return updated;
}

export function recordCancelledEvent(record: CancelledEventRecord) {
  cancelled.push(record);
}

export function getCancelledEvents(): CancelledEventRecord[] {
  return cancelled;
}

export function resetCalendarMock() {
  scenario = "success";
  created.length = 0;
  updated.length = 0;
  cancelled.length = 0;
}
