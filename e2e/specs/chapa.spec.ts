import { createHmac } from "crypto";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { ensureTestFixtures, cleanupBooking, createAdminClient, backdateHoldExpiry } from "../fixtures/supabase-admin";
import { loginAsFixture } from "../fixtures/auth";
import { reserveFirstAvailableSlot, fillBookingIntake, continueToPayment } from "../fixtures/booking";

/**
 * Phase 8 (Chapa payment integration) -- exercises the full
 * initialize -> redirect -> return/webhook -> verify -> finalize flow
 * against MockChapaClient (lib/chapa/mock.ts), never the real Chapa API
 * (spec section 63: the normal suite must not depend on Chapa's uptime).
 *
 * REQUIRES the dev server this suite drives to be started with
 * CHAPA_MODE=mock and NEXT_PUBLIC_APP_URL=<PLAYWRIGHT_BASE_URL> set (see
 * package.json's test:e2e:chapa script and e2e/README.md) -- outside
 * CHAPA_MODE=mock, isChapaConfigured() is false, "Pay with Chapa" never
 * renders, and /api/test/chapa-mock/* 404s, so every test here would
 * fail for an environment reason unrelated to the app logic under test.
 * Skipped automatically (not failed) when that env isn't present, so a
 * plain `npm run test:e2e` run of the rest of the suite is unaffected.
 *
 * A real-Chapa-test-mode smoke check is a SEPARATE, manual step (see the
 * Phase 8 completion report) -- this file never calls api.chapa.co.
 */
test.describe("Chapa payment integration (mock provider)", () => {
  let expertSlug: string;
  const createdBookingIds: string[] = [];

  test.beforeAll(async () => {
    test.skip(
      process.env.CHAPA_MODE !== "mock",
      "chapa.spec.ts requires the dev server to be started with CHAPA_MODE=mock -- see package.json's test:e2e:chapa script.",
    );
    const fixtures = await ensureTestFixtures();
    expertSlug = fixtures.expertA.expertSlug!;
  });

  test.afterEach(async () => {
    for (const id of createdBookingIds.splice(0)) {
      await cleanupBooking(id);
    }
  });

  async function setMockScenario(request: APIRequestContext, scenario: string) {
    const response = await request.post("/api/test/chapa-mock/scenario", { data: { scenario } });
    expect(response.ok(), `failed to set mock scenario "${scenario}"`).toBeTruthy();
  }

  async function createBookingAwaitingPayment(page: Page) {
    await loginAsFixture(page, "customerA");
    const reference = await reserveFirstAvailableSlot(page, expertSlug, 30);
    await fillBookingIntake(page, {
      discussionTopic: "E2E Chapa test.",
      additionalContext: "No special context.",
    });
    await continueToPayment(page);

    const admin = createAdminClient();
    const { data } = await admin.from("bookings").select("id").eq("booking_reference", reference).single();
    if (!data) throw new Error("booking not found");
    createdBookingIds.push(data.id);
    return { bookingId: data.id, reference };
  }

  /** Clicking "Pay with Chapa" drives create_chapa_payment_attempt (042) ->
   * MockChapaClient.initializeTransaction -> a same-origin redirect through
   * /api/test/chapa-mock/checkout straight back to the real Chapa return
   * route -- there is no interactive fake checkout UI to click through. */
  async function payWithChapa(page: Page) {
    await page.getByRole("button", { name: "Pay with Chapa" }).click();
    await page.waitForURL(/\/booking\/[^/]+\/payment\/chapa\/return\?tx_ref=/);
  }

  function currentTxRef(page: Page): string {
    const txRef = new URL(page.url()).searchParams.get("tx_ref");
    if (!txRef) throw new Error("no tx_ref on current URL: " + page.url());
    return txRef;
  }

  /** HMAC-SHA256(CHAPA_WEBHOOK_SECRET, raw body) -- must match
   * lib/chapa/signature.ts exactly, computed here independently rather
   * than importing app code, so this test genuinely exercises the same
   * boundary a real Chapa delivery would cross. */
  function signWebhookBody(rawBody: string): string {
    const secret = process.env.CHAPA_WEBHOOK_SECRET;
    if (!secret) throw new Error("CHAPA_WEBHOOK_SECRET must be set to run chapa.spec.ts's webhook tests.");
    return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  }

  async function postWebhook(request: APIRequestContext, txRef: string, signature: string | null) {
    const rawBody = JSON.stringify({ tx_ref: txRef, status: "success" });
    return request.post("/api/payments/chapa/webhook", {
      data: rawBody,
      headers: signature ? { "x-chapa-signature": signature, "content-type": "application/json" } : { "content-type": "application/json" },
    });
  }

  test("mock success: Pay with Chapa confirms the booking end-to-end", async ({ page }) => {
    await setMockScenario(page.request, "success");
    const { bookingId } = await createBookingAwaitingPayment(page);

    await payWithChapa(page);
    // finalPaymentStatus === "verified" redirects straight back to the
    // payment page (app/booking/[reference]/payment/chapa/return/page.tsx),
    // which then shows the confirmed booking.
    await expect(page.getByRole("heading", { name: "Booking Confirmed" })).toBeVisible();

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).toBe("confirmed");

    const { data: payment } = await admin
      .from("payments")
      .select("payment_status, payment_method")
      .eq("booking_id", bookingId)
      .single();
    expect(payment?.payment_method).toBe("chapa");
    expect(payment?.payment_status).toBe("verified");
  });

  test("mock failed: payment marked failed, booking stays awaiting_payment, customer can retry", async ({ page }) => {
    await setMockScenario(page.request, "failed");
    const { bookingId } = await createBookingAwaitingPayment(page);

    await payWithChapa(page);
    await expect(page.getByRole("heading", { name: "Payment Failed" })).toBeVisible();

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).toBe("awaiting_payment");

    await page.getByRole("link", { name: "Back to payment options" }).click();
    await expect(page.getByText("Your Chapa payment didn't go through.")).toBeVisible();
    // A fresh Chapa attempt is still offered (never blocked by the
    // now-failed attempt), and manual bank transfer remains available too.
    await expect(page.getByRole("button", { name: "Pay with Chapa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Manual Bank Transfer" })).toBeVisible();
  });

  test("mock pending: shows Checking Your Payment without confirming anything", async ({ page }) => {
    await setMockScenario(page.request, "pending");
    const { bookingId } = await createBookingAwaitingPayment(page);

    await payWithChapa(page);
    await expect(page.getByRole("heading", { name: "Checking Your Payment..." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Check Again" })).toBeVisible();

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).toBe("awaiting_payment");
    const { data: payment } = await admin.from("payments").select("payment_status").eq("booking_id", bookingId).single();
    expect(payment?.payment_status).toBe("initiated");
  });

  test("mock amount mismatch: never confirms, payment moves to requires_review", async ({ page }) => {
    await setMockScenario(page.request, "amount_mismatch");
    const { bookingId } = await createBookingAwaitingPayment(page);

    await payWithChapa(page);
    await expect(page.getByRole("heading", { name: "Payment Requires Review" })).toBeVisible();

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).not.toBe("confirmed");
    const { data: payment } = await admin.from("payments").select("payment_status").eq("booking_id", bookingId).single();
    expect(payment?.payment_status).toBe("requires_review");
  });

  test("mock currency mismatch: never confirms, payment moves to requires_review", async ({ page }) => {
    await setMockScenario(page.request, "currency_mismatch");
    const { bookingId } = await createBookingAwaitingPayment(page);

    await payWithChapa(page);
    await expect(page.getByRole("heading", { name: "Payment Requires Review" })).toBeVisible();

    const admin = createAdminClient();
    const { data: payment } = await admin.from("payments").select("payment_status").eq("booking_id", bookingId).single();
    expect(payment?.payment_status).toBe("requires_review");
  });

  test("mock wrong tx_ref: a provider response disagreeing about its own tx_ref never confirms", async ({ page }) => {
    await setMockScenario(page.request, "wrong_tx_ref");
    const { bookingId } = await createBookingAwaitingPayment(page);

    await payWithChapa(page);
    // finalize_chapa_payment (043) compares Chapa's reported tx_ref against
    // this payment's own provider_tx_ref and routes a mismatch into the
    // same requires_review path as an amount/currency mismatch, rather
    // than confirming on an amount/currency match alone.
    await expect(page.getByRole("heading", { name: "Payment Requires Review" })).toBeVisible();

    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).not.toBe("confirmed");
    const { data: payment } = await admin.from("payments").select("payment_status").eq("booking_id", bookingId).single();
    expect(payment?.payment_status).toBe("requires_review");
  });

  test("SECURITY: webhook rejects a missing/invalid signature", async ({ page, request }) => {
    await setMockScenario(page.request, "success");
    const { bookingId } = await createBookingAwaitingPayment(page);
    await payWithChapa(page); // creates + immediately finalizes the attempt via the return route
    const txRef = currentTxRef(page);

    const noSig = await postWebhook(request, txRef, null);
    expect(noSig.status()).toBe(401);

    const badSig = await postWebhook(request, txRef, "0".repeat(64));
    expect(badSig.status()).toBe(401);

    // Neither request should have touched anything -- state is exactly
    // what the earlier UI flow already finalized.
    const admin = createAdminClient();
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).toBe("confirmed");
  });

  test("IDEMPOTENCY: the same successful webhook delivered multiple times finalizes exactly once", async ({
    page,
    request,
  }) => {
    await setMockScenario(page.request, "success");
    const { bookingId } = await createBookingAwaitingPayment(page);
    await payWithChapa(page);
    const txRef = currentTxRef(page);
    await expect(page.getByRole("heading", { name: "Booking Confirmed" })).toBeVisible();

    // The return route above already finalized this attempt once. A real
    // Chapa webhook delivery for the exact same event arriving 1, 2, or 10
    // times afterward must never re-apply the transition (spec sections
    // 34, 69) -- finalize_chapa_payment's terminal-state short-circuit is
    // what the webhook route relies on for this.
    for (let i = 0; i < 3; i += 1) {
      const rawBody = JSON.stringify({ tx_ref: txRef, status: "success" });
      const response = await request.post("/api/payments/chapa/webhook", {
        data: rawBody,
        headers: { "x-chapa-signature": signWebhookBody(rawBody), "content-type": "application/json" },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe("verified");
    }

    const admin = createAdminClient();
    const { data: payments } = await admin.from("payments").select("id, payment_status").eq("booking_id", bookingId);
    expect(payments).toHaveLength(1);
    expect(payments?.[0].payment_status).toBe("verified");
    const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
    expect(booking?.booking_status).toBe("confirmed");
  });

  test("CONCURRENCY: a callback/webhook race converges on one result, never a duplicate transition", async ({
    page,
    request,
  }) => {
    await setMockScenario(page.request, "success");
    const { bookingId } = await createBookingAwaitingPayment(page);

    // Create the local attempt without letting the return-route redirect
    // finalize it yet -- clicking the button always drives straight
    // through to the return route, so this test races the WEBHOOK against
    // itself twice concurrently instead (both entry points call the exact
    // same verifyAndFinalizeChapaTransaction, so racing either pair
    // exercises the same FOR UPDATE lock/terminal-state short-circuit).
    await payWithChapa(page);
    const txRef = currentTxRef(page);

    const rawBody = JSON.stringify({ tx_ref: txRef, status: "success" });
    const signature = signWebhookBody(rawBody);
    const [first, second] = await Promise.all([
      request.post("/api/payments/chapa/webhook", {
        data: rawBody,
        headers: { "x-chapa-signature": signature, "content-type": "application/json" },
      }),
      request.post("/api/payments/chapa/webhook", {
        data: rawBody,
        headers: { "x-chapa-signature": signature, "content-type": "application/json" },
      }),
    ]);
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);

    const admin = createAdminClient();
    const { data: payments } = await admin.from("payments").select("id, payment_status").eq("booking_id", bookingId);
    expect(payments).toHaveLength(1);
    expect(payments?.[0].payment_status).toBe("verified");
  });

  test(
    "abandoned checkout + late success after hold expiry: an expired reservation is never silently " +
      "double-booked, and a genuinely successful late payment is never lost -- it moves to requires_review",
    async ({ page, request }) => {
      // "pending" keeps the attempt open (never finalized) so this test
      // can control exactly when the hold expires before Chapa's success
      // notification arrives.
      await setMockScenario(page.request, "pending");
      const { bookingId, reference } = await createBookingAwaitingPayment(page);
      await payWithChapa(page);
      const txRef = currentTxRef(page);

      // Deterministic time-travel past the 30-minute Chapa checkout hold
      // (chapa_checkout_hold_minutes()) instead of waiting 30 real minutes
      // -- same technique as payments.spec.ts's grace-period test.
      await backdateHoldExpiry(bookingId, 45 * 60);

      await page.goto(`/booking/${reference}`);
      await expect(page.getByText("Your reserved time expired.")).toBeVisible();

      // Chapa now reports success for the same tx_ref -- genuinely
      // verified money movement, but the reservation is no longer safely
      // confirmable (spec sections 32-33, the single most safety-critical
      // rule in this phase). Must NOT confirm the booking and must NOT
      // discard the evidence that Chapa took the customer's money.
      const rawBody = JSON.stringify({ tx_ref: txRef, status: "success" });
      const response = await request.post("/api/payments/chapa/webhook", {
        data: rawBody,
        headers: { "x-chapa-signature": signWebhookBody(rawBody), "content-type": "application/json" },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { status: string };
      expect(body.status).toBe("requires_review");

      const admin = createAdminClient();
      const { data: booking } = await admin.from("bookings").select("booking_status").eq("id", bookingId).single();
      expect(booking?.booking_status).not.toBe("confirmed");
      const { data: payment } = await admin.from("payments").select("payment_status, verified_at").eq("booking_id", bookingId).single();
      expect(payment?.payment_status).toBe("requires_review");
      expect(payment?.verified_at).toBeTruthy(); // evidence preserved, never discarded
    },
  );
});
