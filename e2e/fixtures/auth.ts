import type { Page } from "@playwright/test";
import { testFixtures, type FixtureKey } from "./env";

/**
 * Logs in through the REAL /auth/login form -- this is deliberately not a
 * shortcut (e.g. injecting a session cookie), because auth-nav.spec.ts and
 * every other spec's login step IS part of what's under test (spec
 * section 85: reusable helpers, "do not duplicate setup in every test",
 * but the login UI itself stays real).
 *
 * `next` mirrors the app's own `next` query param convention (see
 * components/auth/LoginForm.tsx) so a spec can assert the full
 * resume-after-login round trip (e.g. resuming a booking selection).
 */
export async function loginAs(page: Page, email: string, password: string, next?: string) {
  const target = next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login";
  await page.goto(target);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  // A successful login always navigates away from /auth/login (either to
  // `next` or the default /dashboard/profile) -- waiting on that is a
  // stronger, less timing-fragile signal than waiting on any specific
  // destination heading.
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/login"));
}

export async function loginAsFixture(page: Page, key: FixtureKey, next?: string) {
  const cfg = testFixtures[key];
  await loginAs(page, cfg.email, cfg.password, next);
}

/** Public header's "Log Out" is a plain form button, not a link. */
export async function logout(page: Page) {
  await page.getByRole("button", { name: "Log Out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

/**
 * Auto-accepts every window.confirm() this app raises (PaymentVerifyButton,
 * AdminActionButton's `confirm` prop, the pre-repair Skip/Remove modals
 * were replaced with ConfirmDialog but a few one-click admin actions still
 * use the native dialog) so a submit click never silently stalls on an
 * unhandled dialog. Call once per test/page before any action that raises
 * one.
 */
export function autoAcceptDialogs(page: Page) {
  page.on("dialog", (dialog) => dialog.accept());
}
