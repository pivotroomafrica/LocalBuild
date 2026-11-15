"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getChapaClient } from "@/lib/chapa/factory";
import { getAppUrl, isChapaConfigured, getChapaMode } from "@/lib/chapa/config";
import { verifyAndFinalizeChapaTransaction } from "@/lib/chapa/verify";
import { getBookingByReference } from "@/lib/booking/data";

const GENERIC_ERROR = "We couldn't start the payment. Please try again.";

/**
 * Same discipline as lib/payment/actions.ts's toSafeError -- only ever
 * show a customer a message create_chapa_payment_attempt() (042) itself
 * wrote to be customer-facing.
 */
function toSafeError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR;
  const knownFragments = [
    "logged in",
    "Booking not found",
    "reserved time expired",
    "booking details first",
    "no longer awaiting payment",
  ];
  return knownFragments.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : GENERIC_ERROR;
}

export type StartChapaPaymentState = {
  error?: string;
};

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed || "Customer", lastName: "Pivotroom" };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

/** Chapa's phone_number field is optional (spec section 10) and this
 * project has no confirmed current documentation on its exact required
 * format -- rather than invent a normalization rule, a phone value is
 * only forwarded when it already looks like a plausible phone number
 * (digits, optional leading +, 7-15 digits), and simply omitted
 * otherwise so a customer with an unusual stored phone value is never
 * blocked from checkout over it. */
function plausiblePhoneOrUndefined(phone: string | null): string | undefined {
  if (!phone) return undefined;
  const digitsOnly = phone.replace(/[^\d+]/g, "");
  return /^\+?\d{7,15}$/.test(digitsOnly) ? digitsOnly : undefined;
}

/**
 * "Pay with Chapa" (spec sections 8, 13, 15). Creates the local payment
 * attempt FIRST via create_chapa_payment_attempt() (042, which resolves
 * customer/amount/currency server-side and extends the booking hold),
 * THEN calls Chapa's initialize API with that attempt's tx_ref, THEN
 * redirects the browser to Chapa's own checkout_url -- never a URL this
 * action constructs itself (spec section 15). If the Chapa HTTP call
 * fails, the local row is flipped to failed via mark_own_chapa_payment_
 * failed() so a retry isn't blocked by the one-active-attempt constraint.
 */
/** Creates the local attempt, initializes it with Chapa and returns
 * Chapa's checkout_url (or a customer-safe error). Shared by "Pay with
 * Chapa" and "Continue to Chapa". */
async function beginChapaCheckout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email: string },
  bookingReference: string,
  expertSlug: string,
): Promise<{ checkoutUrl: string } | { error: string }> {
  const mode = getChapaMode();
  const { data: attemptRows, error: attemptError } = await supabase
    .rpc("create_chapa_payment_attempt", {
      p_booking_reference: bookingReference,
      p_provider_mode: mode === "mock" ? "test" : mode,
    })
    .maybeSingle();

  if (attemptError) return { error: toSafeError(attemptError.message) };
  if (!attemptRows?.provider_tx_ref) return { error: GENERIC_ERROR };

  const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
  const { firstName, lastName } = splitName(profile?.full_name ?? "Pivotroom Customer");

  const appUrl = getAppUrl();
  const txRef = attemptRows.provider_tx_ref;

  const chapa = getChapaClient();
  const initResult = await chapa.initializeTransaction({
    amount: Number(attemptRows.expected_amount).toFixed(2),
    currency: attemptRows.currency,
    email: user.email,
    firstName,
    lastName,
    phoneNumber: plausiblePhoneOrUndefined(profile?.phone ?? null),
    txRef,
    callbackUrl: `${appUrl}/api/payments/chapa/webhook`,
    // Chapa's checkout is the one place the booking leaves the expert's
    // page; it returns to the same page and booking rail, which re-verifies
    // (chapa_return=1) idempotently.
    returnUrl: `${appUrl}/experts/${encodeURIComponent(expertSlug)}?booking=${encodeURIComponent(bookingReference)}&chapa_return=1&tx_ref=${encodeURIComponent(txRef)}`,
    // customization.title has a live-confirmed 16-character limit.
    title: "Pivotroom",
    description: `Booking ${bookingReference}`,
  });

  if (!initResult.ok) {
    await supabase.rpc("mark_own_chapa_payment_failed", {
      p_payment_id: attemptRows.payment_id,
      p_reason: "initialization_failed",
    });
    console.error("beginChapaCheckout: Chapa initialize failed", initResult.error);
    return { error: GENERIC_ERROR };
  }
  return { checkoutUrl: initResult.checkoutUrl };
}

/**
 * "Pay with Chapa" (spec sections 8, 13, 15). Creates the local payment
 * attempt FIRST via create_chapa_payment_attempt() (042, which resolves
 * customer/amount/currency server-side and extends the booking hold),
 * THEN calls Chapa's initialize API with that attempt's tx_ref, THEN
 * redirects the browser to Chapa's own checkout_url -- never a URL this
 * action constructs itself (spec section 15). If the Chapa HTTP call
 * fails, the local row is flipped to failed via mark_own_chapa_payment_
 * failed() so a retry isn't blocked by the one-active-attempt constraint.
 */
export async function startChapaPaymentAction(
  _prevState: StartChapaPaymentState,
  formData: FormData,
): Promise<StartChapaPaymentState> {
  if (!isChapaConfigured()) return { error: GENERIC_ERROR };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "You must be logged in to do that." };

  const bookingReference = String(formData.get("booking_reference") ?? "");
  const expertSlug = String(formData.get("expert_slug") ?? "");
  if (!bookingReference || !expertSlug) return { error: GENERIC_ERROR };

  const result = await beginChapaCheckout(supabase, { id: user.id, email: user.email }, bookingReference, expertSlug);
  if ("error" in result) return { error: result.error };
  redirect(result.checkoutUrl);
}

export type LeaveChapaState = { error?: string; done?: "paid" | "left" };

/**
 * The way out of "Payment processing" when a Chapa checkout was opened but
 * not finished (Chapa then reports "not paid yet" for ever, and the
 * attempt would stay 'initiated'). First asks Chapa once more -- if it was
 * paid after all, that wins. Otherwise closes the attempt as
 * 'abandoned_by_customer' (finalize_chapa_payment, 063, still flags a
 * later payment on that old page for review) and then either opens a
 * fresh Chapa checkout (intent=chapa) or returns to the payment choices
 * (intent=bank).
 */
export async function leaveChapaAttemptAction(_prev: LeaveChapaState, formData: FormData): Promise<LeaveChapaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "You must be logged in to do that." };

  const bookingReference = String(formData.get("booking_reference") ?? "");
  const expertSlug = String(formData.get("expert_slug") ?? "");
  const intent = formData.get("intent") === "chapa" ? "chapa" : "bank";
  if (!bookingReference || !expertSlug) return { error: GENERIC_ERROR };

  const booking = await getBookingByReference(supabase, bookingReference);
  if (!booking || booking.customer_id !== user.id) return { error: "Booking not found." };

  const { data: attempt } = await supabase
    .from("payments")
    .select("id, provider_tx_ref")
    .eq("booking_id", booking.id)
    .eq("payment_method", "chapa")
    .eq("payment_status", "initiated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (attempt?.provider_tx_ref && isChapaConfigured()) {
    try {
      const outcome = await verifyAndFinalizeChapaTransaction(attempt.provider_tx_ref);
      if (outcome.finalPaymentStatus === "verified" || outcome.finalPaymentStatus === "requires_review") {
        return { done: "paid" };
      }
      if (outcome.error) console.error(`leaveChapaAttemptAction: Chapa check: ${outcome.error}`);
    } catch (error) {
      // Can't ask Chapa right now: carry on. If that checkout was in fact
      // paid, finalize_chapa_payment (063) flags it for review later.
      console.error("leaveChapaAttemptAction: Chapa check failed", error);
    }
  }
  if (attempt) {
    await supabase.rpc("mark_own_chapa_payment_failed", {
      p_payment_id: attempt.id,
      p_reason: "abandoned_by_customer",
    });
  }

  if (intent === "chapa") {
    if (!isChapaConfigured()) return { error: GENERIC_ERROR };
    const result = await beginChapaCheckout(supabase, { id: user.id, email: user.email }, bookingReference, expertSlug);
    if ("error" in result) return { error: result.error };
    redirect(result.checkoutUrl);
  }
  return { done: "left" };
}
