/**
 * Test-only, process-scoped state for FakeEmailProvider -- same pattern
 * as lib/chapa/mockControl.ts. A Playwright test sets the next scenario
 * and reads back what was "sent" via real HTTP round trips to
 * /api/test/integrations-mock/* (gated by INTEGRATIONS_MODE=mock,
 * unreachable otherwise), since the test process and the running
 * next dev/next start server are separate processes.
 */
export type EmailMockScenario = "success" | "failure";

export type SentEmailRecord = {
  to: string;
  subject: string;
  idempotencyKey: string;
  sentAt: string;
};

let scenario: EmailMockScenario = "success";
const sent: SentEmailRecord[] = [];

export function setEmailMockScenario(next: EmailMockScenario) {
  scenario = next;
}

export function getEmailMockScenario(): EmailMockScenario {
  return scenario;
}

export function recordSentEmail(record: SentEmailRecord) {
  sent.push(record);
}

export function getSentEmails(): SentEmailRecord[] {
  return sent;
}

export function resetEmailMock() {
  scenario = "success";
  sent.length = 0;
}
