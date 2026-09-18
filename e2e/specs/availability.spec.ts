import { test, expect } from "@playwright/test";
import { ensureTestFixtures, cleanupAvailabilityForExpert } from "../fixtures/supabase-admin";
import { loginAsFixture } from "../fixtures/auth";

/**
 * Phase 4 (day-of-month + overrides availability model) + the
 * pre-next-phase-repair "availability disappearing after navigating into
 * the booking flow and back" fix (RouterRefreshOnMount).
 */
test.describe("Expert availability", () => {
  let expertProfileId: string;

  test.beforeAll(async () => {
    const fixtures = await ensureTestFixtures();
    expertProfileId = fixtures.expertA.expertProfileId!;
  });

  test.afterEach(async () => {
    // Fixture-scoped only (spec section 2/3): clears anything a test added
    // for test_expert_a so specs stay order-independent, never touches
    // the base recurring rule ensureTestFixtures provisions.
    await cleanupAvailabilityForExpert(expertProfileId);
  });

  test("expert can add a specific-date availability slot and it persists after reload", async ({ page }) => {
    await loginAsFixture(page, "expertA");
    await page.goto("/expert/availability");
    await expect(page.getByRole("heading", { name: "Availability" })).toBeVisible();

    await page.getByRole("button", { name: "+ Add a specific date" }).click();

    const future = new Date();
    future.setDate(future.getDate() + 10);
    const dateStr = future.toISOString().slice(0, 10);

    await page.locator('input[type="date"]').fill(dateStr);
    await page.getByRole("button", { name: "Add Availability" }).click();

    await expect(page.getByText(dateStr)).toBeVisible();

    await page.reload();
    await expect(page.getByText(dateStr)).toBeVisible();
  });

  test(
    "REGRESSION: availability does not disappear after navigating into the booking flow and back " +
      "(pre-next-phase repair -- RouterRefreshOnMount / Next.js Client Cache back-navigation bug)",
    async ({ page }) => {
      await loginAsFixture(page, "expertA");
      await page.goto("/expert/availability");
      await expect(page.getByText("Regular Monthly Availability")).toBeVisible();
      // The fixture's day-28 rule is always present -- captured as the
      // baseline state to diff against after the round trip.
      const ruleText = await page.locator("text=/day 28|28(st|nd|rd|th)?/i").first().textContent().catch(() => null);

      // Navigate into a completely different part of the app (the public
      // booking flow) and back via the browser's own back button -- this
      // is exactly the repro path from the original bug report.
      await page.goto("/experts");
      await page.goBack();

      await expect(page.getByRole("heading", { name: "Availability" })).toBeVisible();
      await expect(page.getByText("Regular Monthly Availability")).toBeVisible();
      // The regular monthly rule must still be rendered, not an empty
      // "No regular availability added yet." state.
      await expect(page.getByText("No regular availability added yet.")).toHaveCount(0);
      if (ruleText) {
        await expect(page.getByText(ruleText, { exact: false })).toBeVisible();
      }
    },
  );

  test("viewing availability never mutates it (no-mutation-from-viewing invariant)", async ({ page }) => {
    await loginAsFixture(page, "expertA");
    await page.goto("/expert/availability");
    const before = await page.locator("body").innerText();

    await page.reload();
    await page.reload();

    const after = await page.locator("body").innerText();
    // Loose structural check: the set of duration/day labels rendered
    // should be identical across repeated views. This is intentionally a
    // text-content comparison (not a DB assertion) because the DB-level
    // "no mutation from a read-only RPC" guarantee is covered directly in
    // the live SQL regression sweep (task #108) -- this spec's job is to
    // confirm the UI-visible result is stable across repeated visits.
    expect(after).toBe(before);
  });
});
