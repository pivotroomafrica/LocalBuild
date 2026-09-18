import { test, expect } from "@playwright/test";
import { ensureTestFixtures } from "../fixtures/supabase-admin";
import { loginAs, loginAsFixture, logout } from "../fixtures/auth";
import { testFixtures } from "../fixtures/env";

/**
 * Phase 1 + pre-next-phase-repair regression: auth-aware public
 * navigation, route protection, and the login/signup round trip.
 *
 * The auth-nav bug this covers (README "Pre-Next-Phase Repair" section):
 * before the fix, `/` was fully statically prerendered with zero
 * request-time auth awareness, so a logged-in visitor still saw
 * Login/Sign Up. The fix (app/(public)/layout.tsx + PublicHeader reading
 * supabase.auth.getUser() via cookies()) makes `/`, /experts,
 * /experts/[slug], /become-an-expert all dynamically auth-aware. This
 * suite re-asserts that on every run, not just at fix time.
 */
test.describe("Auth-aware public navigation", () => {
  test.beforeAll(async () => {
    await ensureTestFixtures();
  });

  test("logged-out visitor sees Log In / Sign Up on every public page", async ({ page }) => {
    for (const path of ["/", "/experts", "/become-an-expert"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Log In" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Sign Up" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
    }
  });

  test("logged-in customer sees Dashboard, never Log In/Sign Up, on every public page", async ({ page }) => {
    await loginAsFixture(page, "customerA");

    for (const path of ["/", "/experts", "/become-an-expert"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Log In" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Sign Up" })).toHaveCount(0);
      // Not an approved expert -- must not see the expert dashboard link.
      await expect(page.getByRole("link", { name: "Expert Dashboard" })).toHaveCount(0);
    }
  });

  test("dual-identity account sees BOTH Dashboard and Expert Dashboard at once", async ({ page }) => {
    await loginAsFixture(page, "dualIdentity");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Expert Dashboard" })).toBeVisible();
  });

  test("logging out returns the header to its logged-out state without a stale flash", async ({ page }) => {
    await loginAsFixture(page, "customerA");
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

    await logout(page);
    await expect(page.getByRole("link", { name: "Log In" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  });

  test("back/forward navigation never re-shows a stale logged-out header after login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Log In" })).toBeVisible();

    await loginAsFixture(page, "customerA", "/");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

    await page.goto("/experts");
    await page.goBack();
    // Regression target: browser back navigation must not resurrect the
    // pre-login Client Cache RSC payload for `/`.
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log In" })).toHaveCount(0);
  });
});

test.describe("Route protection (proxy.ts PROTECTED_PREFIXES)", () => {
  const protectedPaths = ["/dashboard", "/dashboard/profile", "/expert/availability", "/admin", "/admin/bookings"];

  for (const path of protectedPaths) {
    test(`unauthenticated visit to ${path} redirects to /auth/login?next=${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/auth/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    });
  }

  test("logging in from a protected-route redirect resumes at the original destination", async ({ page }) => {
    await page.goto("/dashboard/profile");
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
    await loginAs(page, testFixtures.customerA.email, testFixtures.customerA.password);
    await expect(page).toHaveURL(/\/dashboard\/profile/);
  });

  test("a non-admin logged-in customer visiting /admin is not shown admin content", async ({ page }) => {
    await loginAsFixture(page, "customerA");
    const response = await page.goto("/admin/bookings");
    // Whatever the exact mechanism (redirect, notFound, 403), a non-admin
    // must never see the admin bookings list.
    expect(response?.status()).not.toBe(200);
    await expect(page.getByRole("heading", { name: "Bookings" })).toHaveCount(0);
  });
});
