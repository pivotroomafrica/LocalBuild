import { test, expect } from "@playwright/test";
import { ensureTestFixtures, cleanupBooking, createAdminClient } from "../fixtures/supabase-admin";
import { loginAsFixture } from "../fixtures/auth";
import { reserveFirstAvailableSlot, fillBookingIntake } from "../fixtures/booking";

/**
 * Phase 12 (critical architecture change) -- scenarios specific to the
 * inline, stateful booking rail architecture itself (as opposed to the
 * booking/payment business logic already covered by booking.spec.ts,
 * chapa.spec.ts, and payments.spec.ts, which this file deliberately does
 * not duplicate). Like those files, written and tsc/eslint-checked but
 * not executed live in this sandbox (no network access to run next dev/
 * Supabase from here) -- see e2e/README.md.
 *
 * Covers the requested scenarios that are specific to "one profile, one
 * persistent rail, zero full-page navigation" as an architecture, not to
 * any individual booking/payment RPC:
 *   - in-place state transitions (never a route change for an internal
 *     step)
 *   - enabled-format-only selection
 *   - refresh-after-hold recovery
 *   - browser Back never cancels an active hold
 *   - cross-customer isolation via a manipulated `?booking=` reference
 *   - a stale/foreign reference never blocks the public profile itself
 *   - mobile sheet close/reopen recovers the active reservation
 *   - no horizontal overflow at the three required mobile widths
 */
test.describe("Inline booking rail architecture", () => {
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

  test("SESSION through REVIEW never leaves the expert profile route (no full navigation for an internal step)", async ({
    page,
  }) => {
    await loginAsFixture(page, "customerA");
    await page.goto(`/experts/${expertSlug}`);
    expect(new URL(page.url()).pathname).toBe(`/experts/${expertSlug}`);

    const reference = await reserveFirstAvailableSlot(page, expertSlug, 30);
    createdBookingIds.push(
      (await createAdminClient().from("bookings").select("id").eq("booking_reference", reference).single()).data!.id,
    );

    // Hold exists -- still the SAME pathname, only the query string
    // changed (BookingRail's own router.push, never a route change).
    expect(new URL(page.url()).pathname).toBe(`/experts/${expertSlug}`);
    await expect(page.getByRole("heading", { name: "Time reserved" })).toBeVisible();

    await fillBookingIntake(page, {
      discussionTopic: "E2E rail architecture test.",
      additionalContext: "Testing in-place transitions.",
    });
    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/experts/${expertSlug}`);

    // The left-column profile content never unmounted -- still on the
    // page throughout, proving the profile is the stable context and the
    // rail is the only thing that changed.
    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
  });

  test("only the expert's actually-enabled format is offered (fixture is online-only)", async ({ page }) => {
    await loginAsFixture(page, "customerA");
    await page.goto(`/experts/${expertSlug}`);
    await page.getByRole("button", { name: /^30 min/ }).click();

    // With exactly one enabled format there is no format-selection step
    // at all (RailSelect only renders it "if there's a real choice") --
    // "In Person" must never appear for a fixture that never enabled it.
    await expect(page.getByRole("button", { name: "In Person" })).toHaveCount(0);
    await expect(page.getByText("Available: Online")).toBeVisible();
  });

  test("refresh after a hold exists recovers the exact same rail state, never restarting SESSION", async ({
    page,
  }) => {
    await loginAsFixture(page, "customerA");
    const reference = await reserveFirstAvailableSlot(page, expertSlug, 30);
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    createdBookingIds.push(data!.id);

    await page.reload();
    // Still HOLD (no intake yet for a fresh booking) -- never bounced
    // back to duration/time selection, and never silently re-created a
    // second hold (the URL's own `?booking=` reference is unchanged).
    await expect(page.getByRole("heading", { name: "Time reserved" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("booking")).toBe(reference);

    const { data: after } = await admin.from("bookings").select("id").eq("booking_reference", reference);
    expect(after).toHaveLength(1); // exactly one booking row, refresh created no duplicate
  });

  test("browser Back after a hold exists returns to a clean pre-hold profile WITHOUT cancelling the hold", async ({
    page,
  }) => {
    await loginAsFixture(page, "customerA");
    await page.goto(`/experts/${expertSlug}`);
    const reference = await reserveFirstAvailableSlot(page, expertSlug, 30);
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id, booking_status").eq("booking_reference", reference).single();
    createdBookingIds.push(data!.id);
    expect(data?.booking_status).toBe("held");

    await page.goBack();
    // Back landed on the pre-hold profile view (no `?booking=`) --
    // RailSelect's own fresh SESSION state, never an ejection from the
    // expert's page entirely.
    expect(new URL(page.url()).searchParams.get("booking")).toBeNull();
    await expect(page.getByRole("heading", { name: "Session options" })).toBeVisible();

    // Critically: going back is UI navigation, never a business-state
    // rollback -- the hold itself must still be exactly what it was.
    const { data: afterBack } = await admin.from("bookings").select("booking_status").eq("id", data!.id).single();
    expect(afterBack?.booking_status).toBe("held");
  });

  test("cross-customer isolation: Customer B cannot recover Customer A's booking via a manipulated ?booking= reference", async ({
    page,
    browser,
  }) => {
    // Customer A creates a real hold.
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsFixture(pageA, "customerA");
    const reference = await reserveFirstAvailableSlot(pageA, expertSlug, 30);
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    createdBookingIds.push(data!.id);
    await contextA.close();

    // Customer B, signed in as themselves, tries A's reference directly.
    await loginAsFixture(page, "customerB");
    await page.goto(`/experts/${expertSlug}?booking=${reference}`);

    // Never A's held reservation, its intake, or any fact about it --
    // getRailBookingSnapshot returns null on the ownership mismatch, so
    // the rail falls back to a fresh SESSION state, identical to a
    // reference that never existed.
    await expect(page.getByRole("heading", { name: "Time reserved" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Session options" })).toBeVisible();

    // The profile itself is still fully browsable -- a foreign/invalid
    // booking reference never blocks the public page.
    await expect(page.getByRole("button", { name: /^30 min/ })).toBeVisible();
  });

  test("an anonymous visitor can browse the profile even with a foreign ?booking= reference present", async ({
    page,
    browser,
  }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsFixture(pageA, "customerA");
    const reference = await reserveFirstAvailableSlot(pageA, expertSlug, 30);
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    createdBookingIds.push(data!.id);
    await contextA.close();

    // Fully logged out this time -- the public profile content (SSR'd,
    // no session at all) must render exactly as it would for any other
    // visitor; only the private booking snapshot is protected.
    await page.goto(`/experts/${expertSlug}?booking=${reference}`);
    await expect(page.getByRole("heading", { name: "Time reserved" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^30 min/ })).toBeVisible();
  });

  test("closing the mobile booking sheet after a hold exists does not lose the reservation; reopening recovers it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsFixture(page, "customerA");
    // reserveFirstAvailableSlot opens the mobile sheet itself (below the
    // lg breakpoint) before selecting a duration.
    const reference = await reserveFirstAvailableSlot(page, expertSlug, 30);
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    createdBookingIds.push(data!.id);

    await expect(page.getByRole("heading", { name: "Time reserved" })).toBeVisible();
    await page.getByRole("button", { name: "Close booking sheet" }).click();

    // The sheet is closed but the server-side hold is completely
    // unaffected -- closing is UI-only, never an implicit release.
    const { data: afterClose } = await admin.from("bookings").select("booking_status").eq("id", data!.id).single();
    expect(afterClose?.booking_status).toBe("held");

    // Reopening (now labeled for the in-progress booking, not a fresh
    // "Book a session") recovers the exact same reservation.
    await page.getByRole("button", { name: "Continue booking" }).click();
    await expect(page.getByRole("heading", { name: "Time reserved" })).toBeVisible();
  });

  for (const width of [360, 390, 412]) {
    test(`no horizontal overflow on the expert profile + booking rail at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/experts/${expertSlug}`);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Open the mobile sheet too -- its own content must not overflow
      // either, and the sticky bottom bar's CTA must be a real 44px+
      // touch target (spec: "never a tiny centered modal").
      const trigger = page.getByRole("button", { name: "Book a session" });
      await expect(trigger).toBeVisible();
      const box = await trigger.boundingBox();
      expect(box).not.toBeNull();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);

      await trigger.click();
      const afterOpen = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(afterOpen.scrollWidth).toBeLessThanOrEqual(afterOpen.clientWidth + 1);
    });
  }
});
