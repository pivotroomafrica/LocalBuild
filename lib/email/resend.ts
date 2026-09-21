import type { EmailProvider, EmailSendParams, EmailSendResult } from "./provider";
import { getResendApiKey, getEmailFrom, getReplyTo, isEmailDeliveryEnabled } from "./config";

/**
 * Production email client -- the only place in this codebase that makes
 * a real HTTP call to api.resend.com. Endpoint/fields as researched
 * during Phase 9 build (developers.google.com and resend.com were both
 * blocked from this sandbox's network -- same limitation documented in
 * the Phase 8 completion report for Chapa -- corroborated instead via
 * WebSearch across multiple independent sources: Resend's own docs page
 * title/description, third-party integration guides, and the
 * Idempotency-Keys changelog entry). Re-verify against Resend's current
 * official docs before relying on this in production.
 *
 * POST https://api.resend.com/emails
 * Authorization: Bearer <RESEND_API_KEY>
 * Idempotency-Key: <job dedupe_key> (spec section 49 -- provider-level
 * duplicate-send protection, not just our own dedupe_key uniqueness)
 * Body: { from, to: [to], subject, html, text, reply_to? }
 * Response: { id: string } on success.
 */
const RESEND_BASE_URL = "https://api.resend.com";

export class ResendEmailProvider implements EmailProvider {
  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!isEmailDeliveryEnabled()) {
      console.info("Resend: delivery disabled (EMAIL_DELIVERY_ENABLED=false), not sending", {
        to: params.to,
        idempotencyKey: params.idempotencyKey,
      });
      return { ok: true, providerId: "delivery-disabled" };
    }

    try {
      const response = await fetch(`${RESEND_BASE_URL}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getResendApiKey()}`,
          "Content-Type": "application/json",
          "Idempotency-Key": params.idempotencyKey,
        },
        body: JSON.stringify({
          from: getEmailFrom(),
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
          ...(getReplyTo() ? { reply_to: getReplyTo() } : {}),
        }),
      });

      const json = (await response.json().catch(() => null)) as
        | { id?: string; message?: string; name?: string }
        | null;

      if (!response.ok || !json?.id) {
        return { ok: false, error: json?.message ?? `Resend send failed (HTTP ${response.status}).` };
      }

      return { ok: true, providerId: json.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown error contacting Resend." };
    }
  }
}
