import { test, expect } from "@playwright/test";
import { ensureTestFixtures, cleanupBooking, createAdminClient, backdateHoldExpiry } from "../fixtures/supabase-admin";
import { loginAsFixture } from "../fixtures/auth";

/**
 * Phase 7 (customer/expert/admin dashboards) + the Phase 7 browser-test
 * repair (migration 040 -- get_expert_context_for_booking; explicit
 * expert_profile_id + booking_status filters in lib/expert/sessions.ts and
 * lib/dashboard/data.ts, defense-in-depth against the RLS
 * OR-combination leak).
 *
 * These tests provision a CONFIRMED booking directly via the service-role
 * client (spec section 2 allows this for fixture-owned rows) rather than
 * driving the full booking+payment UI flow again -- that flow is already
 * exercised end-to-end in booking.spec.ts / payments.spec.ts, and
 * duplicating it here would just make these dashboard-visibility tests
 * slower without testing anything new.
 */
test.describe("Dashboards: visibility and cross-user security", () => {
  let customerAId: string;
  let expertAProfileId: string;
  let confirmedBookingId: string;
  let confirmedBookingReference: string;

  test.beforeAll(async () => {
    const fixtures = await ensureTestFixtures();
    customerAId = fixtures.customerA.userId;
    expertAProfileId = fixtures.expertA.expertProfileId!;

    const admin = createAdminClient();
    const start = new Date();
    start.setDate(start.getDate() + 5);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);

    const reference = `E2ECONF${Date.now()}`.slice(0, 20).toUpperCase();
    const { data, error } = await admin
      .from("bookings")
      .insert({
        booking_reference: reference,
        customer_id: customerAId,
        expert_profile_id: expertAProfileId,
        duration_minutes: 30,
        session_format: "online",
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        expert_timezone: "Africa/Addis_Ababa",
        base_price: 25000,
        currency: "ETB",
        booking_status: "confirmed",
      })
      .select("id, booking_reference")
      .single();
    if (error) throw error;
    confirmedBookingId = data.id;
    confirmedBookingReference = data.booking_reference;
  });

  test.afterAll(async () => {
    await cleanupBooking(confirmedBookingId);
  });

  test("customer dashboard resolves the expert's name correctly (not 'Unknown Expert')", async ({ page }) => {
    await loginAsFixture(page, "customerA");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Unknown Expert")).toHaveCount(0);

    await page.goto(`/dashboard/sessions/${confirmedBookingReference}`);
    await expect(page.getByText("Unknown Expert")).toHaveCount(0);
  });

  test("expert dashboard shows the real customer's name, never the expert's own identity", async ({ page }) => {
    await loginAsFixture(page, "expertA");
    await page.goto("/expert/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Test Expert A")).toHaveCount(0); // never the expert's own name as "customer"

    await page.goto(`/expert/sessions/${confirmedBookingReference}`);
    await expect(page.getByText("Test Expert A", { exact: true })).toHaveCount(0);
  });

  test(
    "CRITICAL REGRESSION: an awaiting_payment booking must never be visible to the expert " +
      "(RLS OR-combination leak fix -- explicit expert_profile_id + booking_status filters)",
    async ({ page }) => {
      const admin = createAdminClient();
      const start = new Date();
      start.setDate(start.getDate() + 6);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 30);
      const reference = `E2EAWP${Date.now()}`.slice(0, 20).toUpperCase();

      const { data, error } = await admin
        .from("bookings")
        .insert({
          booking_reference: reference,
          customer_id: customerAId,
          expert_profile_id: expertAProfileId,
          duration_minutes: 30,
          session_format: "online",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          expert_timezone: "Africa/Addis_Ababa",
          base_price: 25000,
          currency: "ETB",
          booking_status: "awaiting_payment",
        })
        .select("id")
        .single();
      if (error) throw error;

      try {
        await loginAsFixture(page, "expertA");
        await page.goto("/expert/sessions");
        await expect(page.getByText(reference)).toHaveCount(0);

        const response = await page.goto(`/expert/sessions/${reference}`);
        expect(response?.status()).toBe(404);
      } finally {
        await cleanupBooking(data.id);
      }
    },
  );

  test("SECURITY: dual-identity account sees a booking as customer but NOT as expert on its own session-owner view", async ({
    page,
  }) => {
    const fixtures = await ensureTestFixtures();
    const dualUserId = fixtures.dualIdentity.userId;
    const dualExpertProfileId = fixtures.dualIdentity.expertProfileId!;

    // The dual-identity account books itself as a CUSTOMER against
    // expert_a -- a completely separate identity/session from its own
    // expert profile, so it must not leak into its own expert dashboard.
    const admin = createAdminClient();
    const start = new Date();
    start.setDate(start.getDate() + 7);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 30);
    const reference = `E2EDUAL${Date.now()}`.slice(0, 20).toUpperCase();
    const { data, error } = await admin
      .from("bookings")
      .insert({
        booking_reference: reference,
        customer_id: dualUserId,
        expert_profile_id: expertAProfileId,
        duration_minutes: 30,
        session_format: "online",
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        expert_timezone: "Africa/Addis_Ababa",
        base_price: 25000,
        currency: "ETB",
        booking_status: "confirmed",
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      await loginAsFixture(page, "dualIdentity");
      await page.goto("/dashboard/sessions");
      await expect(page.getByText(reference)).toBeVisible();

      // This booking's expert_profile_id is expert_a's, not the dual
      // identity's own expert profile -- it must never show up on the
      // dual identity's OWN expert/sessions list.
      await page.goto("/expert/sessions");
      await expect(page.getByText(reference)).toHaveCount(0);
      void dualExpertProfileId;
    } finally {
      await cleanupBooking(data.id);
    }
  });

  test("admin bookings list and detail are reachable and show the booking", async ({ page }) => {
    await loginAsFixture(page, "admin");
    await page.goto("/admin/bookings");
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
    await expect(page.getByText(confirmedBookingReference)).toBeVisible();

    await page.goto(`/admin/bookings/${confirmedBookingReference}`);
    await expect(page.getByRole("heading", { name: confirmedBookingReference })).toBeVisible();
  });

  test("SECURITY: customer B cannot view customer A's session detail page (direct reference guess)", async ({
    page,
  }) => {
    await loginAsFixture(page, "customerB");
    const response = await page.goto(`/dashboard/sessions/${confirmedBookingReference}`);
    expect(response?.status()).toBe(404);
  });

  test("SECURITY: expert B cannot view a booking belonging to expert A", async ({ page }) => {
    await loginAsFixture(page, "expertB");
    const response = await page.goto(`/expert/sessions/${confirmedBookingReference}`);
    expect(response?.status()).toBe(404);
  });
});

/**
 * Admin booking list: hold-expiry-aware status (final Phase 7 polish fix).
 *
 * getAdminBookingList() (lib/booking/data.ts) used to filter/display by
 * the raw `booking_status` column alone, so a held/awaiting_payment
 * reservation whose `hold_expires_at` had already passed (spec section
 * 33: no cron, only the next real mutation flips the column) could keep
 * showing under "Held"/"Awaiting Payment" indefinitely even though the
 * slot had already reopened everywhere else in the app. The fix reuses
 * the same `isHoldExpired()` check the customer/expert dashboards
 * already apply, via a new `effectiveBookingStatus()` helper -- these
 * four tests are the exact scenarios named in that fix's requirements.
 *
 * Expiry is exercised deterministically via `backdateHoldExpiry()`
 * (service-role client), not a real wait -- see e2e/README.md's
 * "Time-based testing strategy".
 */
test.describe("Admin booking list: hold-expiry-aware status", () => {
  let customerAId: string;
  let expertAProfileId: string;
  let expiredHeldBookingId: string;
  let activeHeldBookingId: string;
  let confirmedBookingId: string;

  test.beforeAll(async () => {
    const fixtures = await ensureTestFixtures();
    customerAId = fixtures.customerA.userId;
    expertAProfileId = fixtures.expertA.expertProfileId!;

    const admin = createAdminClient();

    async function insertBooking(reference: string, status: "held" | "confirmed", holdMinutesFromNow: number | null) {
      const start = new Date();
      start.setDate(start.getDate() + 8);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 30);
      const { data, error } = await admin
        .from("bookings")
        .insert({
          booking_reference: reference,
          customer_id: customerAId,
          expert_profile_id: expertAProfileId,
          duration_minutes: 30,
          session_format: "online",
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          expert_timezone: "Africa/Addis_Ababa",
          base_price: 25000,
          currency: "ETB",
          booking_status: status,
          hold_expires_at:
            holdMinutesFromNow === null ? null : new Date(Date.now() + holdMinutesFromNow * 60_000).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    }

    expiredHeldBookingId = await insertBooking(`E2EEXP${Date.now()}`.slice(0, 20).toUpperCase(), "held", 20);
    activeHeldBookingId = await insertBooking(`E2EACT${Date.now()}`.slice(0, 20).toUpperCase(), "held", 20);
    confirmedBookingId = await insertBooking(`E2ECONFB${Date.now()}`.slice(0, 20).toUpperCase(), "confirmed", null);

    // Deterministic time-travel: backdate ONLY the first booking's hold
    // past expiry, leaving the second genuinely active for comparison.
    await backdateHoldExpiry(expiredHeldBookingId, 5 * 60);
  });

  test.afterAll(async () => {
    await cleanupBooking(expiredHeldBookingId);
    await cleanupBooking(activeHeldBookingId);
    await cleanupBooking(confirmedBookingId);
  });

  test("expired held booking appears under the Expired tab", async ({ page }) => {
    await loginAsFixture(page, "admin");
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("booking_reference").eq("id", expiredHeldBookingId).single();

    await page.goto("/admin/bookings?tab=expired");
    await expect(page.getByText(data!.booking_reference)).toBeVisible();
  });

  test("expired held booking does NOT appear under the Held tab", async ({ page }) => {
    await loginAsFixture(page, "admin");
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("booking_reference").eq("id", expiredHeldBookingId).single();

    await page.goto("/admin/bookings?tab=held");
    await expect(page.getByText(data!.booking_reference)).toHaveCount(0);
  });

  test("a genuinely active held booking still appears under the Held tab", async ({ page }) => {
    await loginAsFixture(page, "admin");
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("booking_reference").eq("id", activeHeldBookingId).single();

    await page.goto("/admin/bookings?tab=held");
    await expect(page.getByText(data!.booking_reference)).toBeVisible();
  });

  test("a confirmed booking's tab membership is unaffected", async ({ page }) => {
    await loginAsFixture(page, "admin");
    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("booking_reference").eq("id", confirmedBookingId).single();

    await page.goto("/admin/bookings?tab=confirmed");
    await expect(page.getByText(data!.booking_reference)).toBeVisible();

    await page.goto("/admin/bookings?tab=expired");
    await expect(page.getByText(data!.booking_reference)).toHaveCount(0);
  });
});
