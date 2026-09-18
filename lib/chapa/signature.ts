import { createHmac, timingSafeEqual } from "crypto";
import { getChapaWebhookSecret } from "./config";

/**
 * Chapa webhook signature verification -- header `x-chapa-signature`,
 * HMAC-SHA256(key = CHAPA_WEBHOOK_SECRET, message = the exact raw request
 * body bytes). Cross-referenced via third-party SDK/community
 * documentation during this project's Phase 8 build (direct access to
 * developer.chapa.co was blocked from this sandbox's network -- see the
 * Phase 8 completion report) -- re-verify against the current official
 * docs before relying on this in production.
 *
 * Takes the RAW body string, not a parsed/re-serialized object (spec
 * section 20: re-serializing JSON can reorder keys/change whitespace and
 * silently invalidate the signature) -- the webhook route reads
 * request.text() before any JSON.parse, and this function is the only
 * place that parses it, after the signature has already been checked.
 *
 * Uses a timing-safe comparison (crypto.timingSafeEqual) rather than
 * `===` so this check itself cannot leak timing information about the
 * expected signature.
 */
export function verifyChapaWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", getChapaWebhookSecret()).update(rawBody, "utf8").digest("hex");

  const provided = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}
