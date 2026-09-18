import type { ChapaClient, ChapaInitializeParams, ChapaInitializeResult, ChapaVerifyResult, ChapaVerifiedStatus } from "./client";
import { getChapaSecretKey } from "./config";

/**
 * Production Chapa client -- the only place in this codebase that makes
 * a real HTTP call to api.chapa.co. Endpoints/fields as specified in
 * Chapa's current developer docs (Initialize: POST
 * /v1/transaction/initialize, Verify: GET
 * /v1/transaction/verify/{tx_ref}, Authorization: Bearer <secret key>) --
 * cross-referenced via third-party SDK documentation during this
 * project's Phase 8 build since this sandbox's outbound network could
 * not reach developer.chapa.co directly to diff against the live page
 * (documented in the Phase 8 completion report's "Chapa docs research"
 * section). Re-verify against the current official docs before relying
 * on this in production.
 */
const CHAPA_BASE_URL = "https://api.chapa.co";

/** Chapa's own data.status vocabulary collapses to this project's 3-state
 * ChapaVerifiedStatus -- "success" and "pending" pass through, every
 * other raw value (failed/cancelled/reversed/refunded/unknown/anything
 * new Chapa adds later) is treated as "failed" for the sole purpose of
 * deciding whether to confirm a booking; the raw string itself is never
 * discarded (see ChapaVerifyResult.rawStatus). */
function normalizeStatus(rawStatus: string | undefined | null): ChapaVerifiedStatus {
  if (rawStatus === "success") return "success";
  if (rawStatus === "pending") return "pending";
  return "failed";
}

export class RealChapaClient implements ChapaClient {
  private readonly secretKey: string;

  constructor(secretKey: string = getChapaSecretKey()) {
    this.secretKey = secretKey;
  }

  async initializeTransaction(params: ChapaInitializeParams): Promise<ChapaInitializeResult> {
    try {
      const response = await fetch(`${CHAPA_BASE_URL}/v1/transaction/initialize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: params.amount,
          currency: params.currency,
          email: params.email,
          first_name: params.firstName,
          last_name: params.lastName,
          ...(params.phoneNumber ? { phone_number: params.phoneNumber } : {}),
          tx_ref: params.txRef,
          callback_url: params.callbackUrl,
          return_url: params.returnUrl,
          customization: {
            title: params.title ?? "Pivotroom Session",
            description: params.description ?? "Payment for a Pivotroom expert session",
          },
        }),
      });

      const json = (await response.json().catch(() => null)) as
        | { status?: string; message?: string; data?: { checkout_url?: string } }
        | null;

      if (!response.ok || !json || json.status !== "success" || !json.data?.checkout_url) {
        return { ok: false, error: json?.message ?? `Chapa initialize failed (HTTP ${response.status}).` };
      }

      return { ok: true, checkoutUrl: json.data.checkout_url };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown error contacting Chapa." };
    }
  }

  async verifyTransaction(txRef: string): Promise<ChapaVerifyResult> {
    try {
      const response = await fetch(`${CHAPA_BASE_URL}/v1/transaction/verify/${encodeURIComponent(txRef)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });

      const json = (await response.json().catch(() => null)) as
        | {
            status?: string;
            message?: string;
            data?: {
              tx_ref?: string;
              status?: string;
              amount?: string | number;
              currency?: string;
              reference?: string;
            };
          }
        | null;

      if (!response.ok || !json) {
        return { ok: false, error: `Chapa verify failed (HTTP ${response.status}).` };
      }

      // Chapa's top-level `status` reflects whether the API CALL
      // succeeded; the actual payment business state is only ever
      // data.status (spec section 22-23) -- an HTTP-level success with no
      // usable data.status is never treated as a payment success.
      if (json.status !== "success" || !json.data) {
        return { ok: false, error: json.message ?? "Chapa could not find or verify this transaction." };
      }

      const rawStatus = json.data.status ?? "unknown";
      return {
        ok: true,
        status: normalizeStatus(rawStatus),
        rawStatus,
        txRef: json.data.tx_ref ?? txRef,
        amount: json.data.amount != null ? String(json.data.amount) : null,
        currency: json.data.currency ?? null,
        reference: json.data.reference ?? null,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Unknown error contacting Chapa." };
    }
  }
}
