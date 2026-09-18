/**
 * In-memory scenario switch for MockChapaClient, server-process-scoped
 * (module-level state persists across requests within one running `next
 * dev`/`next start` process -- exactly what a Playwright test needs: it
 * runs in a separate process driving a browser against this same running
 * server, and sets the next scenario via a real HTTP round trip to
 * app/api/test/chapa-mock/route.ts before triggering the flow under
 * test). Never imported by any production code path -- only
 * MockChapaClient (mock.ts) and the test-control route read/write this.
 */

export type ChapaMockScenario =
  | "success"
  | "failed"
  | "pending"
  | "amount_mismatch"
  | "currency_mismatch"
  | "wrong_tx_ref"
  | "init_error";

let currentScenario: ChapaMockScenario = "success";

export function setChapaMockScenario(scenario: ChapaMockScenario) {
  currentScenario = scenario;
}

export function getChapaMockScenario(): ChapaMockScenario {
  return currentScenario;
}
