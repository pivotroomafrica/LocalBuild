import { test, expect, type Page } from "@playwright/test";
import {
  ensureTestFixtures,
  cleanupBooking,
  createAdminClient,
  setBookingStartAtHoursFromNow,
} from "../fixtures/supabase-admin";
import { loginAsFixture, autoAcceptDialogs } from "../fixtures/auth";
import { reserveFirstAvailableSlot, fillBookingIntake, continueToPayment, submitManualPayment } from "../fixtures/booking";

/**
 * Phase 10 (rescheduling + cancellation) -- exercises the customer/
 * expert/admin reschedule and cancel flows against real Supabase RPCs
 * (reschedule_booking, cancel_customer_booking, cancel_expert_booking,
 * admin_reschedule_booking, admin_cancel_booking, request_expert_
 * reschedule, decline_expert_reschedule_request; 045). Like phase9.spec.ts,
 * written but not executed in this sandbox (no network access to run next
 * dev/Supabase from here) -- see e2e/README.md. The DB-level guarantees
 * (24-hour cutoff enforcement against server time, double-booking
 * protection on reschedule via the existing exclusion constraints,
 * financial_followup_required computed correctly, payment_status never
 * mutated, RLS/authorization on all three new tables) are additionally
 * live-SQL-verified against PIVOTROOM-DEMO -- see the Phase 10 completion
 * report -- since that actually executes in this environment and this
 * file does not.
 */
test.describe("Phase 10: reschedule + cancellation", () => {
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

  async function createConfirmedBooking(
    page: Page,
    durationMinutes = 30,
  ): Promise<{ bookingId: string; reference: string }> {
    await loginAsFixture(page, "customerA");
    const reference = await reserveFirstAvailableSlot(page, expertSlug, durationMinutes);
    await fillBookingIntake(page, { discussionTopic: "E2E Phase 10 test.", additionalContext: "No special context." });
    await continueToPayment(page);
    await submitManualPayment(page, {
      bankUsed: "Commercial Bank of Ethiopia",
      transactionReference: `E2E-P10-${Date.now()}`,
      amountPaid: "25000",
    });

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    if (!booking) throw new Error("booking not found");
    createdBookingIds.push(booking.id);

    const { data: payment } = await admin.from("payments").select("id").eq("booking_id", booking.id).single();
    if (!payment) throw new Error("payment not found");

    // Verify as admin so the booking reaches 'confirmed' -- every Phase
    // 10 action under test requires a confirmed booking.
    const adminPage = await page.context().newPage();
    await loginAsFixture(adminPage, "admin");
    await adminPage.goto(`/admin/payments/${payment.id}`);
    autoAcceptDialogs(adminPage);
    await adminPage.getByRole("button", { name: "Verify Payment" }).click();
    await adminPage.waitForTimeout(500);
    await adminPage.close();

    return { bookingId: booking.id, reference };
  }

  test("customer reschedules a confirmed booking to a new time; same expert/duration/format/price preserved", async ({
    page,
  }) => {
    const { bookingId, reference } = await createConfirmedBooking(page);
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("bookings")
      .select("expert_profile_id, duration_minutes, session_format, base_price, start_at")
      .eq("id", bookingId)
      .single();

    await page.goto(`/dashboard/sessions/${reference}`);
    await page.getByRole("button", { name: "Reschedule" }).click();
    // Wait for the next month if this month has no other slot, then pick
    // a date/time distinct from the current one.
    await page.getByText("Loading available times...").waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
    const dateButtons = page.locator('[role="dialog"] button').filter({ hasText: /^[A-Za-z]{3},/ });
    if ((await dateButtons.count()) === 0) {
      await page.getByRole("button", { name: "Next →" }).click();
    }
    await dateButtons.first().click();
    const timeButtons = page.locator('[role="dialog"] button').filter({ hasText: /(AM|PM)$/ });
    await timeButtons.first().click();
    await page.getByRole("button", { name: "Confirm New Time" }).click();

    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 });

    const { data: after } = await admin
      .from("bookings")
      .select("expert_profile_id, duration_minutes, session_format, base_price, start_at, booking_status")
      .eq("id", bookingId)
      .single();

    expect(after?.expert_profile_id).toBe(before?.expert_profile_id);
    expect(after?.duration_minutes).toBe(before?.duration_minutes);
    expect(after?.session_format).toBe(before?.session_format);
    expect(after?.base_price).toBe(before?.base_price);
    expect(after?.start_at).not.toBe(before?.start_at);
    expect(after?.booking_status).toBe("confirmed");

    const { data: rescheduleRows } = await admin
      .from("booking_reschedules")
      .select("actor_type, old_start_at, new_start_at")
      .eq("booking_id", bookingId);
    expect(rescheduleRows).toHaveLength(1);
    expect(rescheduleRows?.[0].actor_type).toBe("customer");
    expect(rescheduleRows?.[0].old_start_at).toBe(before?.start_at);
    expect(rescheduleRows?.[0].new_start_at).toBe(after?.start_at);
  });

  test("customer reschedule is blocked inside the 24-hour cutoff (server time, not browser time)", async ({ page }) => {
    const { bookingId, reference } = await createConfirmedBooking(page);
    await setBookingStartAtHoursFromNow(bookingId, 12); // inside the 24h cutoff

    await page.goto(`/dashboard/sessions/${reference}`);
    await expect(page.getByRole("button", { name: "Reschedule" })).toHaveCount(0);
    await expect(page.getByText("Cancel Session")).toHaveCount(0);
  });

  test("customer cancels a confirmed booking; financial_followup_required is true for a verified payment, payment_status is untouched", async ({
    page,
  }) => {
    const { bookingId, reference } = await createConfirmedBooking(page);
    const admin = createAdminClient();
    const { data: paymentBefore } = await admin
      .from("payments")
      .select("payment_status")
      .eq("booking_id", bookingId)
      .single();
    expect(paymentBefore?.payment_status).toBe("verified");

    await page.goto(`/dashboard/sessions/${reference}`);
    await page.getByRole("button", { name: "Cancel Session" }).click();
    await page.locator('[role="dialog"]').getByRole("button", { name: "Cancel Session" }).click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 });

    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).toBe("cancelled");

    const { data: paymentAfter } = await admin
      .from("payments")
      .select("payment_status")
      .eq("booking_id", bookingId)
      .single();
    expect(paymentAfter?.payment_status).toBe("verified"); // never mutated by cancellation

    const { data: cancellationRows } = await admin
      .from("booking_cancellations")
      .select("actor_type, financial_followup_required")
      .eq("booking_id", bookingId);
    expect(cancellationRows).toHaveLength(1);
    expect(cancellationRows?.[0].actor_type).toBe("customer");
    expect(cancellationRows?.[0].financial_followup_required).toBe(true);
  });

  test("cancelling a booking removes its future pending reminder jobs", async ({ page }) => {
    const { bookingId, reference } = await createConfirmedBooking(page);
    const admin = createAdminClient();
    const { data: pendingBefore } = await admin
      .from("integration_jobs")
      .select("id")
      .eq("booking_id", bookingId)
      .in("job_type", ["session_reminder_customer", "session_reminder_expert"])
      .eq("status", "pending");
    expect((pendingBefore ?? []).length).toBeGreaterThan(0);

    await page.goto(`/dashboard/sessions/${reference}`);
    await page.getByRole("button", { name: "Cancel Session" }).click();
    await page.locator('[role="dialog"]').getByRole("button", { name: "Cancel Session" }).click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 });

    const { data: pendingAfter } = await admin
      .from("integration_jobs")
      .select("id")
      .eq("booking_id", bookingId)
      .in("job_type", ["session_reminder_customer", "session_reminder_expert"])
      .eq("status", "pending");
    expect(pendingAfter ?? []).toHaveLength(0);
  });

  test("expert can only REQUEST a reschedule; the booking's own time never changes until the customer acts", async ({
    page,
  }) => {
    const { bookingId, reference } = await createConfirmedBooking(page);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bookings").select("start_at").eq("id", bookingId).single();

    const expertPage = await page.context().newPage();
    await loginAsFixture(expertPage, "expertA");
    await expertPage.goto(`/expert/sessions/${reference}`);
    await expertPage.getByRole("button", { name: "Request Reschedule" }).click();
    await expertPage.getByLabel("Reason (required)").fill("Scheduling conflict on my end.");
    await expertPage.getByRole("button", { name: "Send Request" }).click();
    await expect(expertPage.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 });
    await expertPage.close();

    const { data: after } = await admin.from("bookings").select("start_at").eq("id", bookingId).single();
    expect(after?.start_at).toBe(before?.start_at); // unchanged -- request never touches bookings directly

    const { data: requestRows } = await admin
      .from("booking_change_requests")
      .select("status, requester_type")
      .eq("booking_id", bookingId);
    expect(requestRows).toHaveLength(1);
    expect(requestRows?.[0].status).toBe("pending");
    expect(requestRows?.[0].requester_type).toBe("expert");
  });

  test("expert can cancel their own confirmed session, bypassing the customer's 24-hour cutoff", async ({ page }) => {
    const { bookingId, reference } = await createConfirmedBooking(page);
    await setBookingStartAtHoursFromNow(bookingId, 6); // inside the customer's cutoff

    const expertPage = await page.context().newPage();
    await loginAsFixture(expertPage, "expertA");
    await expertPage.goto(`/expert/sessions/${reference}`);
    await expertPage.getByRole("button", { name: "Cancel Session" }).click();
    await expertPage.getByLabel("Reason (required)").fill("I am no longer available for this session.");
    await expertPage.locator('[role="dialog"]').getByRole("button", { name: "Cancel Session" }).click();
    await expect(expertPage.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 });
    await expertPage.close();

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).toBe("cancelled");

    const { data: cancellationRows } = await admin
      .from("booking_cancellations")
      .select("actor_type, policy_cutoff_met")
      .eq("booking_id", bookingId);
    expect(cancellationRows?.[0].actor_type).toBe("expert");
    expect(cancellationRows?.[0].policy_cutoff_met).toBe(false); // bypassed, and the audit trail says so
  });

  test("a customer cannot reschedule or cancel another customer's booking (cross-customer authorization)", async ({
    page,
  }) => {
    const { reference } = await createConfirmedBooking(page);

    const otherPage = await page.context().newPage();
    await loginAsFixture(otherPage, "customerB");
    await otherPage.goto(`/dashboard/sessions/${reference}`);
    // Ownership is enforced both by RLS and an explicit application-layer
    // check (getCustomerSessionDetail) -- a booking belonging to another
    // customer resolves to the same 404 as one that doesn't exist.
    await expect(otherPage.getByText("This page could not be found")).toBeVisible();
    await otherPage.close();
  });
});
