import { test, expect } from "@playwright/test";
import {
  ensureTestFixtures,
  cleanupBooking,
  createAdminClient,
  backdateHoldExpiry,
} from "../fixtures/supabase-admin";
import { loginAsFixture, autoAcceptDialogs } from "../fixtures/auth";
import { reserveFirstAvailableSlot, fillBookingIntake, continueToPayment, submitManualPayment } from "../fixtures/booking";

/**
 * Phase 6 (manual payment verification) + the pre-next-phase-repair
 * rejection-grace-period fix (migration 041).
 */
test.describe("Manual payment lifecycle", () => {
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

  async function createBookingAwaitingPayment(page: import("@playwright/test").Page) {
    await loginAsFixture(page, "customerA");
    const reference = await reserveFirstAvailableSlot(page, expertSlug, 30);
    await fillBookingIntake(page, {
      discussionTopic: "E2E payments test.",
      additionalContext: "No special context.",
    });
    await continueToPayment(page);

    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    if (!data) throw new Error("booking not found");
    createdBookingIds.push(data.id);
    return { bookingId: data.id, reference };
  }

  test("customer submits a manual payment, admin verifies it, booking is confirmed", async ({ page, context }) => {
    const { reference } = await createBookingAwaitingPayment(page);

    await submitManualPayment(page, {
      bankUsed: "Commercial Bank of Ethiopia",
      transactionReference: `E2E-${Date.now()}`,
      amountPaid: "25000",
    });
    await expect(page.getByRole("heading", { name: "Payment Submitted" })).toBeVisible();

    const admin = createAdminClient();
    const { data: payment } = await admin
      .from("payments")
      .select("id")
      .eq("booking_id", (await admin.from("bookings").select("id").eq("booking_reference", reference).single()).data!.id)
      .single();
    if (!payment) throw new Error("payment row not found");

    const adminPage = await context.newPage();
    await loginAsFixture(adminPage, "admin");
    autoAcceptDialogs(adminPage);
    await adminPage.goto(`/admin/payments/${payment.id}`);
    await adminPage.getByRole("button", { name: "Verify Payment" }).click();
    await adminPage.waitForTimeout(500);

    const { data: bookingAfter } = await admin
      .from("bookings")
      .select("booking_status")
      .eq("booking_reference", reference)
      .single();
    expect(bookingAfter?.booking_status).toBe("confirmed");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Booking Confirmed" })).toBeVisible();
  });

  test("admin rejects a payment: booking stays awaiting_payment, customer sees the reason and can resubmit", async ({
    page,
    context,
  }) => {
    await createBookingAwaitingPayment(page);

    await submitManualPayment(page, {
      bankUsed: "Awash Bank",
      transactionReference: `E2E-REJECT-${Date.now()}`,
      amountPaid: "25000",
    });

    const admin = createAdminClient();
    const { data: paymentRow } = await admin
      .from("payments")
      .select("id, booking_id")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .single();
    if (!paymentRow) throw new Error("payment row not found");

    const adminPage = await context.newPage();
    await loginAsFixture(adminPage, "admin");
    await adminPage.goto(`/admin/payments/${paymentRow.id}`);
    await adminPage.getByPlaceholder(/Why is this payment being rejected/).fill("E2E test: reference could not be verified.");
    await adminPage.getByRole("button", { name: "Reject Payment" }).click();
    await adminPage.waitForTimeout(500);

    const { data: bookingAfter } = await admin.from("bookings").select("booking_status, hold_expires_at").eq("id", paymentRow.booking_id).single();
    // reject_manual_payment() (038) never touches booking_status; the
    // pre-next-phase repair (migration 041) extends hold_expires_at by a
    // grace period instead of leaving the booking held forever.
    expect(bookingAfter?.booking_status).toBe("awaiting_payment");
    expect(bookingAfter?.hold_expires_at).toBeTruthy();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Payment Needs Attention" })).toBeVisible();
    await expect(page.getByText("E2E test: reference could not be verified.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Submit New Payment Details" })).toBeVisible();
  });

  test(
    "REGRESSION: rejected-payment grace period actually expires the reservation once it elapses " +
      "(pre-next-phase repair -- migration 041, deterministic via backdated hold_expires_at)",
    async ({ page, context }) => {
      const { bookingId } = await createBookingAwaitingPayment(page);
      await submitManualPayment(page, {
        bankUsed: "Awash Bank",
        transactionReference: `E2E-GRACE-${Date.now()}`,
        amountPaid: "25000",
      });

      const admin = createAdminClient();
      const { data: paymentRow } = await admin
        .from("payments")
        .select("id")
        .eq("booking_id", bookingId)
        .single();
      if (!paymentRow) throw new Error("payment row not found");

      const adminPage = await context.newPage();
      await loginAsFixture(adminPage, "admin");
      await adminPage.goto(`/admin/payments/${paymentRow.id}`);
      await adminPage.getByPlaceholder(/Why is this payment being rejected/).fill("E2E test: grace expiry check.");
      await adminPage.getByRole("button", { name: "Reject Payment" }).click();
      await adminPage.waitForTimeout(500);

      // Deterministic time-travel past the 120-minute grace window
      // (payment_rejection_grace_minutes()) instead of waiting 2 real
      // hours -- see e2e/README.md "Time-based testing strategy".
      await backdateHoldExpiry(bookingId, 3 * 60 * 60);

      await page.goto(`/booking/${(await admin.from("bookings").select("booking_reference").eq("id", bookingId).single()).data!.booking_reference}`);
      await expect(page.getByText("Your reserved time expired.")).toBeVisible();
    },
  );

  test("admin can release a held/awaiting_payment reservation directly", async ({ page, context }) => {
    const { bookingId, reference } = await createBookingAwaitingPayment(page);

    const adminPage = await context.newPage();
    await loginAsFixture(adminPage, "admin");
    autoAcceptDialogs(adminPage);
    await adminPage.goto(`/admin/bookings/${reference}`);
    await adminPage.getByRole("button", { name: "Release Reservation" }).click().catch(async () => {
      // Fall back to whatever the AdminReleaseButton's actual label is if
      // it differs from this guess -- the important assertion is the DB
      // state change below, not the exact button text.
      await adminPage.getByRole("button", { name: /release/i }).click();
    });
    await adminPage.waitForTimeout(500);

    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(data?.booking_status).toBe("expired");
  });

  test("SECURITY: a customer cannot verify their own payment (no admin route exposed to non-admins)", async ({
    page,
  }) => {
    const { bookingId } = await createBookingAwaitingPayment(page);
    await submitManualPayment(page, {
      bankUsed: "Dashen Bank",
      transactionReference: `E2E-SELFVERIFY-${Date.now()}`,
      amountPaid: "25000",
    });

    const admin = createAdminClient();
    const { data: paymentRow } = await admin.from("payments").select("id").eq("booking_id", bookingId).single();
    if (!paymentRow) throw new Error("payment row not found");

    // Still logged in as the customer -- /admin/* is protected by
    // proxy.ts, so this must never render the admin verify UI.
    const response = await page.goto(`/admin/payments/${paymentRow.id}`);
    expect(response?.status()).not.toBe(200);
    await expect(page.getByRole("button", { name: "Verify Payment" })).toHaveCount(0);
  });
});
