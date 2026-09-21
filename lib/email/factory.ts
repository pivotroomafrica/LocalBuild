import type { EmailProvider } from "./provider";
import { ResendEmailProvider } from "./resend";
import { FakeEmailProvider } from "./fake";

/** The one place application code asks for an email client -- never
 * imports ResendEmailProvider/FakeEmailProvider directly (spec section
 * 69). INTEGRATIONS_MODE=mock (Playwright test environment only, never
 * production config) selects the fake. */
export function getEmailProvider(): EmailProvider {
  if (process.env.INTEGRATIONS_MODE === "mock") return new FakeEmailProvider();
  return new ResendEmailProvider();
}
