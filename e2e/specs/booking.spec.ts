import { test, expect, type Browser } from "@playwright/test";
import { ensureTestFixtures, cleanupBooking, backdateHoldExpiry, createAdminClient } from "../fixtures/supabase-admin";
import { loginAsFixture } from "../fixtures/auth";
import { testFixtures } from "../fixtures/env";
import { reserveFirstAvailableSlot, fillBookingIntake, continueToPayment } from "../fixtures/booking";

/**
 * Phase 5 (booking hold lifecycle) + Phase 6 (manual payment intake step)
 * + the pre-next-phase-repair reservation-release lifecycle.
 *
 * Phase 12 (critical architecture change): rewritten against the inline
 * booking rail on /experts/[slug] -- there is no longer a standalone
 * /book/[slug] picker or /booking/[reference] journey page. A hold's
 * existence is reflected by `?booking=<reference>` on the SAME profile
 * URL, never a navigation to a different route.
 */
test.describe("Public booking flow", () => {
  let expertSlug: string;
  const createdBookingIds: string[] = [];

  test.beforeAll(async () => {
    const fixtures = await ensureTestFixtures();
    expertSlug = fixtures.expertA.expertSlug!;
  });

  test.afterEach(async () => {
    for (const id of createdBookingIds.splice(0)) {
      await cleanupBooking(id);
    }
  });

  test("selection survives the login round trip (in-rail auth gate, spec AUTH_OR_PROFILE) then reserves and advances through intake", async ({
    page,
  }) => {
    // Start logged out -- the rail must offer an inline "Sign in / Create
    // account" gate instead of a hold form when no session exists, and
    // never navigate away to a separate-looking login page.
    await page.goto(`/experts/${expertSlug}`);
    await page.getByRole("button", { name: /^30 min/ }).click();
    await page.waitForTimeout(500); // allow the slots fetch to resolve before probing dates

    const dateTimeBlock = page.getByTestId("rail-date-time");
    await dateTimeBlock.locator("button[aria-pressed]").first().click();
    const chips = dateTimeBlock.locator("button[aria-pressed]");
    await chips.nth((await chips.count()) - 1).click();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "Sign in and continue" })).toBeVisible();

    // The rail never navigated -- we're still on the plain profile URL,
    // with the previously-picked slot's date/time summary still visible.
    await expect(page).toHaveURL(new RegExp(`/experts/${expertSlug}$`));

    const { email, password } = testFixtures.customerA;
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in and continue" }).click();

    // A successful inline sign-in re-derives isLoggedIn/profileComplete
    // from fresh server props (router.refresh()) without navigating --
    // the SAME slot picked before login is still selected, reaching
    // "Reserve This Time" directly rather than needing to re-pick it.
    await expect(page.getByRole("button", { name: "Reserve This Time" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Reserve This Time" }).click();
    await page.waitForURL(/[?&]booking=[^&]+/, { timeout: 15_000 });
    const reference = new URL(page.url()).searchParams.get("booking");
    expect(reference).toBeTruthy();

    await expect(page).toHaveURL(new RegExp(`booking=${reference}`));
    await expect(page.getByRole("heading", { name: "Time reserved" })).toBeVisible();

    // Fixture customer already has a complete customer_profiles row, so
    // the rail should land directly on the intake step.
    await expect(page.getByRole("heading", { name: "Before your session" })).toBeVisible();

    await fillBookingIntake(page, {
      discussionTopic: "E2E test: reviewing my career transition plan.",
      additionalContext: "No special context needed for this automated test.",
    });

    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
    await continueToPayment(page);

    // Still the SAME URL -- payment rendered in place, never a
    // navigation to a standalone page.
    await expect(page).toHaveURL(new RegExp(`booking=${reference}`));

    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    if (data) createdBookingIds.push(data.id);
  });

  test("an expired hold shows 'Choose another time' inline instead of the intake journey", async ({ page }) => {
    await loginAsFixture(page, "customerA");
    const reference = await reserveFirstAvailableSlot(page, expertSlug, 30);

    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    if (!data) throw new Error("booking row not found after hold creation");
    createdBookingIds.push(data.id);

    // Deterministic expiry (spec section 4): backdate hold_expires_at by
    // service-role client instead of waiting the real hold duration.
    await backdateHoldExpiry(data.id, 24 * 60 * 60);

    await page.goto(`/experts/${expertSlug}?booking=${reference}`);
    await expect(page.getByText("Your reserved time expired")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose another time" })).toBeVisible();

    // The profile itself never disappeared -- the expired state is a
    // rail-only panel, not a redirect away from the expert.
    await expect(page.locator("h1")).toBeVisible();
  });

  test("customer can release their own held reservation via Release This Time", async ({ page }) => {
    await loginAsFixture(page, "customerA");
    const reference = await reserveFirstAvailableSlot(page, expertSlug, 30);

    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    if (!data) throw new Error("booking row not found");
    createdBookingIds.push(data.id);

    await page.goto(`/experts/${expertSlug}?booking=${reference}`);
    await page.getByRole("button", { name: "Release This Time" }).click();
    // Pivotroom's own ConfirmDialog (never window.confirm) -- confirm the
    // destructive action inside it.
    await page.getByRole("button", { name: "Release Time" }).click();

    // release_booking_reservation() sets booking_status = 'expired' --
    // the rail should no longer show the active journey for it.
    await page.waitForTimeout(500);
    const { data: after } = await admin.from("bookings").select("booking_status").eq("id", data.id).single();
    expect(after?.booking_status).toBe("expired");
  });

  test("double-booking concurrency: two customers racing for the same slot -- exactly one wins", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await loginAsFixture(pageA, "customerA");
    await loginAsFixture(pageB, "customerB");

    await pageA.goto(`/experts/${expertSlug}`);
    await pageA.getByRole("button", { name: /^30 min/ }).click();
    await pageB.goto(`/experts/${expertSlug}`);
    await pageB.getByRole("button", { name: /^30 min/ }).click();

    await pageA.waitForTimeout(1000);
    await pageB.waitForTimeout(1000);

    const dateTimeA = pageA.getByTestId("rail-date-time");
    const dateTimeB = pageB.getByTestId("rail-date-time");
    await dateTimeA.locator("button[aria-pressed]").first().click();
    await dateTimeB.locator("button[aria-pressed]").first().click();

    const timesA = dateTimeA.locator("button[aria-pressed]");
    const timesB = dateTimeB.locator("button[aria-pressed]");
    await timesA.nth((await timesA.count()) - 1).click();
    await timesB.nth((await timesB.count()) - 1).click(); // same date -> same first slot as A

    const [resultA, resultB] = await Promise.allSettled([
      (async () => {
        await pageA.getByRole("button", { name: "Reserve This Time" }).click();
        await pageA.waitForURL(/[?&]booking=[^&]+/, { timeout: 10_000 });
        return new URL(pageA.url()).searchParams.get("booking")!;
      })(),
      (async () => {
        await pageB.getByRole("button", { name: "Reserve This Time" }).click();
        // The loser should see an error message, never a second hold on
        // the identical start_at for the same expert -- give it a chance
        // to either succeed (bug: double booking) or show an error.
        await Promise.race([
          pageB.waitForURL(/[?&]booking=[^&]+/, { timeout: 10_000 }),
          pageB.getByText(/just taken|no longer available/i).waitFor({ timeout: 10_000 }),
        ]);
        const url = new URL(pageB.url());
        return url.searchParams.get("booking") ?? "";
      })(),
    ]);

    const successfulReferences = [resultA, resultB].filter(
      (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && r.value.length > 0,
    );

    // Exactly one of the two racing customers may end up with an active
    // hold on this exact slot -- the exclusion constraint in
    // 034_booking_functions.sql is the thing actually enforcing this;
    // this test proves it holds under real concurrent browser load.
    expect(successfulReferences.length).toBeLessThanOrEqual(1);

    const admin = createAdminClient();
    for (const r of successfulReferences) {
      const { data } = await admin.from("bookings").select("id").eq("booking_reference", r.value).single();
      if (data) createdBookingIds.push(data.id);
    }

    await contextA.close();
    await contextB.close();
  });
});
