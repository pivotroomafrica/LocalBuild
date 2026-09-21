/**
 * Provider abstraction (spec section 69) -- same pattern as
 * lib/chapa/client.ts. Production code (worker job handlers) never
 * imports ResendEmailProvider/FakeEmailProvider directly, only this
 * interface + the factory (factory.ts).
 */
export type EmailSendParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Passed through as Resend's Idempotency-Key header (spec section 49)
   * -- always the job's own dedupe_key, so a retried job can never
   * produce two sends of the same email even if our own retry logic
   * double-fires the HTTP call. */
  idempotencyKey: string;
};

export type EmailSendResult = { ok: true; providerId: string } | { ok: false; error: string };

export interface EmailProvider {
  send(params: EmailSendParams): Promise<EmailSendResult>;
}
