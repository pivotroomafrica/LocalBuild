import { test, expect } from "@playwright/test";
import { ensureTestFixtures } from "../fixtures/supabase-admin";
import { loginAsFixture } from "../fixtures/auth";

/**
 * Spec section 83: structural mobile/tablet/desktop checks only (no
 * horizontal overflow, no unreachable CTA, no broken nav, no major
 * layout clipping). Aesthetic quality stays a human/"VISUAL / PRODUCT
 * REVIEW" concern -- see e2e/README.md and the final audit report.
 *
 * This file runs under the `tablet` and `mobile` Playwright projects
 * (see playwright.config.ts testMatch) in addition to desktop-chromium,
 * so each test below runs at all three breakpoints without duplicating
 * per-viewport test bodies.
 */
const ROUTES_PUBLIC = ["/", "/experts", "/become-an-expert"];
const ROUTES_AUTHENTICATED = ["/dashboard", "/dashboard/sessions", "/dashboard/payments"];

test.describe("Responsive structural checks", () => {
  test.beforeAll(async () => {
    await ensureTestFixtures();
  });

  for (const path of ROUTES_PUBLIC) {
    test(`${path} has no horizontal overflow`, async ({ page }) => {
      await page.goto(path);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px rounding tolerance
    });

    test(`${path} primary nav links remain visible and clickable`, async ({ page }) => {
      await page.goto(path);
      // Phase 12 workstream B: sentence-case "Browse experts" replaced the
      // pre-redesign "Find an Expert" label. On mobile this link lives
      // inside MobileNav's slide-in drawer, so open it first there.
      const isMobileNav = await page.getByLabel("Open menu").isVisible().catch(() => false);
      if (isMobileNav) await page.getByLabel("Open menu").click();
      const browseExpertsLink = page.getByRole("link", { name: "Browse experts" }).first();
      await expect(browseExpertsLink).toBeVisible();
      const box = await browseExpertsLink.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
      }
    });
  }

  for (const path of ROUTES_AUTHENTICATED) {
    test(`${path} (logged in) has no horizontal overflow`, async ({ page }) => {
      await loginAsFixture(page, "customerA");
      await page.goto(path);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test("the booking rail's primary CTA stays reachable at this viewport", async ({ page }) => {
    const fixtures = await ensureTestFixtures();
    await loginAsFixture(page, "customerA");
    await page.goto(`/experts/${fixtures.expertA.expertSlug}`);

    // Phase 12 (critical architecture change): below the lg breakpoint the
    // rail is a sticky-bottom-bar + sheet, never a compressed sidebar --
    // "Book a session" must open it before the duration chip is reachable.
    const mobileTrigger = page.getByRole("button", { name: "Book a session" });
    if (await mobileTrigger.isVisible().catch(() => false)) await mobileTrigger.click();

    const durationButton = page.getByRole("button", { name: /^30 min/ });
    await expect(durationButton).toBeVisible();
    const box = await durationButton.boundingBox();
    expect(box).not.toBeNull();
  });
});
