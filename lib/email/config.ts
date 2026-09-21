/**
 * Server-only Resend configuration (spec sections 11, 12). Never imported
 * from a "use client" file -- RESEND_API_KEY must never reach the
 * browser bundle.
 */

export function getResendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  return key;
}

/** "Pivotroom <bookings@pivotroom.africa>"-style sender -- from env, not
 * hard-coded (spec section 12: domain verification/config may differ per
 * deployment). */
export function getEmailFrom(): string {
  const from = process.env.PIVOTROOM_EMAIL_FROM;
  if (!from) throw new Error("PIVOTROOM_EMAIL_FROM is not configured.");
  return from;
}

/** Optional -- omitted from the Resend payload entirely when unset,
 * never sent as an empty string. */
export function getReplyTo(): string | undefined {
  return process.env.PIVOTROOM_REPLY_TO || undefined;
}

/** Explicit kill-switch (spec section 67) -- defaults to enabled (same
 * "real key present -> real behavior" polarity as Chapa's
 * isChapaConfigured(), so production never silently stops sending just
 * because this var was left unset). Set EMAIL_DELIVERY_ENABLED=false to
 * force-disable real sends even with a real RESEND_API_KEY configured
 * (e.g. testing locally against production-like env vars without
 * wanting to email real people). Irrelevant in INTEGRATIONS_MODE=mock,
 * which never calls Resend at all regardless of this setting. */
export function isEmailDeliveryEnabled(): boolean {
  return process.env.EMAIL_DELIVERY_ENABLED !== "false";
}

export function isEmailConfigured(): boolean {
  if (process.env.INTEGRATIONS_MODE === "mock") return true;
  return Boolean(process.env.RESEND_API_KEY && process.env.PIVOTROOM_EMAIL_FROM);
}
