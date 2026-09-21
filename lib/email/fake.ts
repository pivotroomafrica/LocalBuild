import type { EmailProvider, EmailSendParams, EmailSendResult } from "./provider";
import { getEmailMockScenario, recordSentEmail } from "./mockControl";

/**
 * Test-only implementation of EmailProvider (spec section 69) -- selected
 * by getEmailProvider() (factory.ts) only when INTEGRATIONS_MODE=mock.
 * Never makes a real network call.
 */
export class FakeEmailProvider implements EmailProvider {
  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (getEmailMockScenario() === "failure") {
      return { ok: false, error: "Mock Resend: simulated send failure." };
    }
    recordSentEmail({
      to: params.to,
      subject: params.subject,
      idempotencyKey: params.idempotencyKey,
      sentAt: new Date().toISOString(),
    });
    return { ok: true, providerId: `mock-email-${params.idempotencyKey}` };
  }
}
