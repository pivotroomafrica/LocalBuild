import type { ChapaClient } from "./client";
import { RealChapaClient } from "./real";
import { MockChapaClient } from "./mock";

/**
 * The one place application code asks for a Chapa client -- never
 * imports RealChapaClient/MockChapaClient directly (spec section 63).
 * CHAPA_MODE=mock (set only in the Playwright test environment, never in
 * production config) selects the mock; everything else uses the real
 * HTTP client against whichever CHAPA_SECRET_KEY is configured.
 */
export function getChapaClient(): ChapaClient {
  if (process.env.CHAPA_MODE === "mock") return new MockChapaClient();
  return new RealChapaClient();
}
