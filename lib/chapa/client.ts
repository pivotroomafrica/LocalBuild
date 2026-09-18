/**
 * Provider abstraction (spec section 63) -- lets the app's own logic
 * (initialize -> redirect -> verify -> finalize) be tested without
 * depending on Chapa's real uptime/network. The PRODUCTION
 * implementation (RealChapaClient) is the only one that ever makes a
 * real HTTP call to api.chapa.co; MockChapaClient (mock.ts) implements
 * the exact same interface for the Playwright suite and any local
 * smoke-testing, selected via getChapaClient()'s CHAPA_MODE=mock switch
 * (factory.ts) -- application code never imports either implementation
 * directly, only this interface + the factory.
 */

export type ChapaVerifiedStatus = "success" | "pending" | "failed";

export type ChapaInitializeParams = {
  /** Exact decimal string, e.g. "25000.00" -- never a floating-point
   * number, to avoid any precision drift between what Pivotroom expects
   * and what Chapa is told to charge. */
  amount: string;
  currency: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  /** Pivotroom-generated, from generate_chapa_tx_ref() (042) -- never the
   * booking UUID (spec section 5). */
  txRef: string;
  /** Where Chapa sends its server-to-server webhook. */
  callbackUrl: string;
  /** Where Chapa redirects the customer's browser back to. */
  returnUrl: string;
  title?: string;
  description?: string;
};

export type ChapaInitializeResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string };

export type ChapaVerifyResult =
  | {
      ok: true;
      /** Normalized 3-state result -- success/pending/failed. Every other
       * raw Chapa status (cancelled, reversed, refunded, unknown, ...)
       * collapses to "failed" for booking-confirmation purposes (Phase 8
       * does not handle refunds/reversals as a distinct flow) while the
       * ORIGINAL string is preserved in rawStatus for admin display and
       * audit -- never discarded, never used to make the confirm/deny
       * decision itself. */
      status: ChapaVerifiedStatus;
      rawStatus: string;
      txRef: string;
      /** Exact decimal string as Chapa returned it -- compared against
       * the local expected_amount as text/numeric, never as a parsed
       * float (spec section 24). */
      amount: string | null;
      currency: string | null;
      reference: string | null;
    }
  | { ok: false; error: string };

export interface ChapaClient {
  initializeTransaction(params: ChapaInitializeParams): Promise<ChapaInitializeResult>;
  verifyTransaction(txRef: string): Promise<ChapaVerifyResult>;
}
