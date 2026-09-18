"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getChapaClient } from "@/lib/chapa/factory";
import { getAppUrl, isChapaConfigured, getChapaMode } from "@/lib/chapa/config";

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
  if (!bookingReference) return { error: GENERIC_ERROR };

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
    returnUrl: `${appUrl}/booking/${encodeURIComponent(bookingReference)}/payment/chapa/return?tx_ref=${encodeURIComponent(txRef)}`,
    title: "Pivotroom Session",
    description: `Booking ${bookingReference}`,
  });

  if (!initResult.ok) {
    await supabase.rpc("mark_own_chapa_payment_failed", {
      p_payment_id: attemptRows.payment_id,
      p_reason: "initialization_failed",
    });
    console.error("startChapaPaymentAction: Chapa initialize failed", initResult.error);
    return { error: GENERIC_ERROR };
  }

  redirect(initResult.checkoutUrl);
}
