import { createServiceRoleClient } from "@/lib/supabase/service";
import { getChapaClient } from "./factory";
import { getChapaMode } from "./config";

export type ChapaFinalizeOutcome = {
  finalPaymentStatus: string;
  finalBookingStatus: string;
  newlyFinalized: boolean;
  error?: string;
};

/**
 * The single shared path both the Chapa return route and the Chapa
 * webhook route call -- never duplicated, so there is exactly one place
 * that decides what "verified" means. Always calls Chapa's own Verify
 * Transaction API itself (spec sections 17, 21, 55: never trusts a
 * webhook/callback payload's own status field), then hands the freshly
 * verified facts to finalize_chapa_payment() (042, service_role only)
 * for the actual atomic state transition.
 *
 * Idempotent and race-safe by construction: finalize_chapa_payment()
 * itself is idempotent (FOR UPDATE row locking + a terminal-state
 * short-circuit) -- calling this function twice for the same tx_ref,
 * concurrently or sequentially, converges to the same single result
 * (spec sections 34-35, 69-70).
 */
export async function verifyAndFinalizeChapaTransaction(txRef: string): Promise<ChapaFinalizeOutcome> {
  const chapa = getChapaClient();
  const verifyResult = await chapa.verifyTransaction(txRef);

  if (!verifyResult.ok) {
    // Chapa's own API call failed (network error, unknown tx_ref, etc.)
    // -- not a payment-status fact, so nothing is finalized. The caller
    // (return page / webhook handler) decides how to respond; a webhook
    // should get a 5xx here so Chapa retries.
    return {
      finalPaymentStatus: "initiated",
      finalBookingStatus: "unknown",
      newlyFinalized: false,
      error: verifyResult.error,
    };
  }

  // txRef mismatch guard (spec section 68/mock "wrong_tx_ref"): the ROW to
  // finalize is always looked up via the tx_ref WE requested (p_provider_
  // tx_ref = txRef), never one an untrusted response claims -- but
  // finalize_chapa_payment() (043) additionally compares p_verified_tx_ref
  // (whatever tx_ref Chapa's own response reported, if any) against that
  // row's own provider_tx_ref, and folds a mismatch into the same
  // requires_review path used for an amount/currency mismatch, so a
  // response that doesn't agree it's describing this transaction can
  // never be silently confirmed.
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("finalize_chapa_payment", {
    p_provider_tx_ref: txRef,
    p_verified_status: verifyResult.status,
    p_verified_amount: verifyResult.amount ? Number(verifyResult.amount) : 0,
    p_verified_currency: verifyResult.currency ?? "",
    p_verified_tx_ref: verifyResult.txRef ?? undefined,
    p_provider_reference: verifyResult.reference ?? undefined,
    p_provider_mode: getChapaMode() === "mock" ? "test" : getChapaMode(),
  });

  if (error || !data || data.length === 0) {
    return {
      finalPaymentStatus: "initiated",
      finalBookingStatus: "unknown",
      newlyFinalized: false,
      error: error?.message ?? "finalize_chapa_payment returned no row.",
    };
  }

  const row = data[0];
  return {
    finalPaymentStatus: row.final_payment_status,
    finalBookingStatus: row.final_booking_status,
    newlyFinalized: row.newly_finalized,
  };
}
