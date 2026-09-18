/**
 * Server-only Chapa configuration. Never imported from a "use client"
 * file -- CHAPA_SECRET_KEY/CHAPA_WEBHOOK_SECRET must never reach the
 * browser bundle (spec section 6), so there is deliberately no
 * NEXT_PUBLIC_ equivalent for either. The one browser-visible fact is
 * "is Chapa available at all", exposed as a plain boolean prop from a
 * Server Component (isChapaConfigured()), never the key itself.
 */

export type ChapaMode = "live" | "test" | "mock";

/**
 * Chapa's own key-prefix convention (test keys are prefixed
 * "CHASECK_TEST-", live keys "CHASECK-") is used only to LABEL which
 * mode a key belongs to for admin display (payments.provider_mode) --
 * Pivotroom never mixes keys across a single request; whichever one key
 * is configured in this environment is the only one ever used for both
 * initialize and verify on a given deployment, so cross-mode
 * verification (spec section 7) is structurally impossible, not just
 * checked after the fact.
 */
function modeFromSecretKey(key: string): "live" | "test" {
  return key.startsWith("CHASECK_TEST-") ? "test" : "live";
}

export function getChapaMode(): ChapaMode {
  if (process.env.CHAPA_MODE === "mock") return "mock";
  const key = process.env.CHAPA_SECRET_KEY;
  if (!key) return "mock"; // unconfigured -- treated as unavailable, see isChapaConfigured()
  return modeFromSecretKey(key);
}

/** Whether the "Pay with Chapa" option should be offered at all (spec
 * section 44: "If Chapa is disabled/not configured in environment: do
 * not render a broken checkout button"). True in mock mode (for tests)
 * or when a real secret key is present. */
export function isChapaConfigured(): boolean {
  if (process.env.CHAPA_MODE === "mock") return true;
  return Boolean(process.env.CHAPA_SECRET_KEY);
}

export function getChapaSecretKey(): string {
  const key = process.env.CHAPA_SECRET_KEY;
  if (!key) throw new Error("CHAPA_SECRET_KEY is not configured.");
  return key;
}

export function getChapaWebhookSecret(): string {
  const secret = process.env.CHAPA_WEBHOOK_SECRET;
  if (!secret) throw new Error("CHAPA_WEBHOOK_SECRET is not configured.");
  return secret;
}

/** The canonical, absolute base URL this deployment is reachable at --
 * required to build Chapa's callback_url/return_url (spec section 16).
 * Not inferred from request headers (spoofable, and return_url must be
 * stable/known ahead of time for Chapa's own dashboard allow-listing) --
 * an explicit, required env var instead. */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  return url.replace(/\/+$/, "");
}
