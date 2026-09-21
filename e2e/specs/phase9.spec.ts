import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { ensureTestFixtures, cleanupBooking, createAdminClient } from "../fixtures/supabase-admin";
import { loginAsFixture } from "../fixtures/auth";
import { reserveFirstAvailableSlot, fillBookingIntake, continueToPayment, submitManualPayment } from "../fixtures/booking";

/**
 * Phase 9 (transactional notifications + Google Calendar + Google Meet)
 * -- exercises the full confirm -> register jobs -> worker -> email/
 * calendar flow against FakeEmailProvider/FakeCalendarProvider
 * (INTEGRATIONS_MODE=mock), never real Resend/Google. Like chapa.spec.ts,
 * written but not executed in this sandbox (no network access to run
 * next dev/Supabase from here) -- see e2e/README.md.
 *
 * The DB-level guarantees (idempotent registration, reminder skip-past-
 * window logic, RLS on integration_jobs, admin_retry_integration_job/
 * admin_backfill_booking_integrations authorization) are additionally
 * live-SQL-verified against PIVOTROOM-DEMO -- see the Phase 9 completion
 * report -- since that actually executes in this environment and this
 * file does not.
 */
test.describe("Phase 9: notifications + calendar (mock providers)", () => {
  let expertSlug: string;
  const createdBookingIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(
      process.env.INTEGRATIONS_MODE !== "mock",
      "phase9.spec.ts requires the dev server to be started with INTEGRATIONS_MODE=mock -- see package.json's test:e2e:phase9 script.",
    );
    const fixtures = await ensureTestFixtures();
    expertSlug = fixtures.expertA.expertSlug!;
  });

  test.afterEach(async ({ request }) => {
    for (const id of createdBookingIds.splice(0)) {
      await cleanupBooking(id);
    }
    await resetMock(request);
  });

  async function resetMock(request: APIRequestContext) {
    await request.post("/api/test/integrations-mock/reset");
  }

  async function setMockScenario(request: APIRequestContext, scenario: { email?: string; calendar?: string }) {
    const response = await request.post("/api/test/integrations-mock/scenario", { data: scenario });
    expect(response.ok()).toBeTruthy();
  }

  async function getMockState(request: APIRequestContext) {
    const response = await request.get("/api/test/integrations-mock/state");
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as {
      sentEmails: { to: string; subject: string; idempotencyKey: string }[];
      createdEvents: { bookingReference: string; eventId: string; meetingUrl: string | null; attendeeEmails: string[] }[];
    };
  }

  async function runWorker(request: APIRequestContext) {
    const response = await request.post("/api/jobs/process", {
      headers: { "x-worker-secret": process.env.INTEGRATION_WORKER_SECRET ?? "" },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()) as { claimed: number; completed: number; failed: number; skipped: number };
  }

  async function createAndConfirmBookingViaManualPayment(
    page: Page,
    durationMinutes = 30,
  ): Promise<{ bookingId: string; reference: string; paymentId: string }> {
    await loginAsFixture(page, "customerA");
    const reference = await reserveFirstAvailableSlot(page, expertSlug, durationMinutes);
    await fillBookingIntake(page, { discussionTopic: "E2E Phase 9 test.", additionalContext: "No special context." });
    await continueToPayment(page);
    await submitManualPayment(page, {
      bankUsed: "Commercial Bank of Ethiopia",
      transactionReference: `E2E-P9-${Date.now()}`,
      amountPaid: "25000",
    });

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    if (!booking) throw new Error("booking not found");
    createdBookingIds.push(booking.id);

    const { data: payment } = await admin.from("payments").select("id").eq("booking_id", booking.id).single();
    if (!payment) throw new Error("payment not found");

    return { bookingId: booking.id, reference, paymentId: payment.id };
  }

  async function verifyAsAdmin(context: import("@playwright/test").BrowserContext, paymentId: string) {
    const adminPage = await context.newPage();
    await loginAsFixture(adminPage, "admin");
    await adminPage.goto(`/admin/payments/${paymentId}`);
    await adminPage.getByRole("button", { name: "Verify Payment" }).click();
    await adminPage.waitForTimeout(500);
    await adminPage.close();
  }

  test("confirming a booking registers exactly the right jobs; the worker sends them once, twice is a no-op", async ({
    page,
    context,
    request,
  }) => {
    await setMockScenario(request, { email: "success", calendar: "success" });
    const { bookingId, reference, paymentId } = await createAndConfirmBookingViaManualPayment(page);
    await verifyAsAdmin(context, paymentId);

    const first = await runWorker(request);
    expect(first.completed).toBeGreaterThanOrEqual(3); // 2 confirmation emails + 1 calendar_create

    const state = await getMockState(request);
    const emailsForThisBooking = state.sentEmails.filter((e) => e.idempotencyKey.endsWith(bookingId));
    expect(emailsForThisBooking).toHaveLength(2);
    const eventsForThisBooking = state.createdEvents.filter((e) => e.bookingReference === reference);
    expect(eventsForThisBooking).toHaveLength(1);

    // Running the worker again finds nothing new due (all 3 jobs are
    // already 'completed') -- no duplicate sends, no duplicate event.
    const second = await runWorker(request);
    expect(second.claimed).toBe(0);
    const stateAfter = await getMockState(request);
    expect(stateAfter.sentEmails.filter((e) => e.idempotencyKey.endsWith(bookingId))).toHaveLength(2);
    expect(stateAfter.createdEvents.filter((e) => e.bookingReference === reference)).toHaveLength(1);
  });

  test("online booking gets a Meet link; in-person does not", async ({ page, context, request }) => {
    await setMockScenario(request, { email: "success", calendar: "success" });
    const { bookingId, reference, paymentId } = await createAndConfirmBookingViaManualPayment(page);
    await verifyAsAdmin(context, paymentId);
    await runWorker(request);

    const state = await getMockState(request);
    const event = state.createdEvents.find((e) => e.bookingReference === reference);
    expect(event).toBeTruthy();
    // Test Expert A's fixture session type is online-only (see
    // e2e/fixtures/supabase-admin.ts's ensureApprovedExpert), so this
    // booking is online -- a real Meet URL is expected.
    expect(event?.meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);

    const admin = createAdminClient();
    const { data: booking } = await admin
      .from("bookings")
      .select("calendar_sync_status, calendar_meeting_url")
      .eq("id", bookingId)
      .single();
    expect(booking?.calendar_sync_status).toBe("synced");
    expect(booking?.calendar_meeting_url).toBe(event?.meetingUrl);

    await page.goto(`/dashboard/sessions/${reference}`);
    await expect(page.getByRole("link", { name: "Join Google Meet" })).toBeVisible();
  });

  test("calendar failure: booking stays confirmed, sync_status is failed, no Meet link shown, admin sees it", async ({
    page,
    context,
    request,
  }) => {
    await setMockScenario(request, { email: "success", calendar: "failure" });
    const { bookingId, reference, paymentId } = await createAndConfirmBookingViaManualPayment(page);
    await verifyAsAdmin(context, paymentId);
    await runWorker(request);

    const admin = createAdminClient();
    const { data: booking } = await admin
      .from("bookings")
      .select("booking_status, calendar_sync_status, calendar_meeting_url")
      .eq("id", bookingId)
      .single();
    expect(booking?.booking_status).toBe("confirmed"); // spec section 2 -- never rolled back
    expect(booking?.calendar_sync_status).toBe("failed");
    expect(booking?.calendar_meeting_url).toBeNull();

    await page.goto(`/dashboard/sessions/${reference}`);
    await expect(page.getByRole("link", { name: "Join Google Meet" })).toHaveCount(0);
    await expect(page.getByText("Meeting details are being prepared.")).toBeVisible();

    const adminPage = await context.newPage();
    await loginAsFixture(adminPage, "admin");
    await adminPage.goto(`/admin/bookings/${reference}`);
    await expect(adminPage.getByText("Failed", { exact: true }).first()).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Retry" }).first()).toBeVisible();
  });

  test("Resend failure: booking stays confirmed, email job scheduled for retry (not lost)", async ({
    page,
    context,
    request,
  }) => {
    await setMockScenario(request, { email: "failure", calendar: "success" });
    const { bookingId, paymentId } = await createAndConfirmBookingViaManualPayment(page);
    await verifyAsAdmin(context, paymentId);
    const result = await runWorker(request);
    expect(result.failed).toBeGreaterThanOrEqual(2); // both confirmation emails failed

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).toBe("confirmed"); // spec section 2 -- never rolled back

    const { data: jobs } = await admin
      .from("integration_jobs")
      .select("job_type, status, attempt_count")
      .eq("booking_id", bookingId)
      .like("job_type", "booking_confirmation_email_%");
    for (const job of jobs ?? []) {
      // First failure: attempt_count=1, still 'pending' (scheduled for a
      // future retry per the backoff policy), not yet 'failed' outright
      // (spec section 30 -- capped backoff, not immediate exhaustion).
      expect(job.status).toBe("pending");
      expect(job.attempt_count).toBe(1);
    }
  });
});
