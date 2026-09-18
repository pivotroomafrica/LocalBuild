import type { ChapaClient, ChapaInitializeParams, ChapaInitializeResult, ChapaVerifyResult } from "./client";
import { getChapaMockScenario } from "./mockControl";
import { getAppUrl } from "./config";

/**
 * Test-only implementation of ChapaClient -- selected by getChapaClient()
 * (factory.ts) only when CHAPA_MODE=mock. Never makes a real network
 * call. Behavior is driven by the process-wide scenario set via
 * setChapaMockScenario()/app/api/test/chapa-mock/route.ts, so a
 * Playwright test can deterministically exercise every path in spec
 * sections 64-73 (mock success/failed/pending/amount-mismatch/currency-
 * mismatch/wrong-tx_ref) without depending on Chapa's real uptime.
 *
 * For "wrong_tx_ref", verifyTransaction() reports a DIFFERENT txRef than
 * the one it was asked to verify (Chapa's response disagreeing with
 * itself about which transaction this is) -- lib/chapa/verify.ts forwards
 * this reported txRef to finalize_chapa_payment() (043) as
 * p_verified_tx_ref, which compares it against the local row's own
 * provider_tx_ref and routes a mismatch into requires_review, the same as
 * an amount/currency mismatch, instead of confirming.
 */
export class MockChapaClient implements ChapaClient {
  async initializeTransaction(params: ChapaInitializeParams): Promise<ChapaInitializeResult> {
    const scenario = getChapaMockScenario();
    if (scenario === "init_error") {
      return { ok: false, error: "Mock Chapa: simulated initialization failure." };
    }
    // The mock "checkout" is a same-origin redirect straight back to the
    // real return_url -- there is no interactive fake checkout UI to
    // build/maintain; what this integration actually needs to exercise
    // is the initialize -> redirect -> return -> verify -> finalize
    // boundary, which this round trip already covers.
    const checkoutUrl = `${getAppUrl()}/api/test/chapa-mock/checkout?tx_ref=${encodeURIComponent(params.txRef)}&return_url=${encodeURIComponent(params.returnUrl)}`;
    return { ok: true, checkoutUrl };
  }

  async verifyTransaction(txRef: string): Promise<ChapaVerifyResult> {
    const scenario = getChapaMockScenario();

    switch (scenario) {
      case "success":
        return {
          ok: true,
          status: "success",
          rawStatus: "success",
          txRef,
          amount: "25000.00",
          currency: "ETB",
          reference: `mock-ref-${txRef}`,
        };
      case "amount_mismatch":
        return {
          ok: true,
          status: "success",
          rawStatus: "success",
          txRef,
          amount: "2500.00",
          currency: "ETB",
          reference: `mock-ref-${txRef}`,
        };
      case "currency_mismatch":
        return {
          ok: true,
          status: "success",
          rawStatus: "success",
          txRef,
          amount: "25000.00",
          currency: "USD",
          reference: `mock-ref-${txRef}`,
        };
      case "pending":
        return { ok: true, status: "pending", rawStatus: "pending", txRef, amount: null, currency: null, reference: null };
      case "failed":
        return { ok: true, status: "failed", rawStatus: "failed", txRef, amount: null, currency: null, reference: null };
      case "wrong_tx_ref":
        return {
          ok: true,
          status: "success",
          rawStatus: "success",
          txRef: `${txRef}-DIFFERENT`,
          amount: "25000.00",
          currency: "ETB",
          reference: `mock-ref-${txRef}`,
        };
      default:
        return { ok: false, error: `Unhandled mock scenario: ${scenario}` };
    }
  }
}
