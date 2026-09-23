"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const GENERIC_ERROR = "We couldn't complete that. Please try again.";

/**
 * cancel_customer_booking() (045) only ever raises messages written to be
 * shown to a customer as-is, same posture as toSafeError() in
 * lib/booking/actions.ts. Anything not on this list falls back to the
 * generic message.
 */
function toSafeError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR;
  const knownFragments = [
    "logged in",
    "Booking not found",
    "not confirmed",
    "cannot be cancelled",
    "24 hours",
    "hours before",
    "reason",
    "own booking",
  ];
  return knownFragments.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : GENERIC_ERROR;
}

export type CancelBookingState = {
  error?: string;
  success?: boolean;
};

/**
 * Customer self-service cancellation (spec sections 1, 3, 25-38). Does
 * NOT touch payment_status or issue any refund -- cancel_customer_booking()
 * (045) only ever sets an objective financial_followup_required boolean
 * for a future Phase 11 to act on. cancel_customer_booking() itself
 * re-checks ownership and the 24-hour cutoff against server time; this
 * action only forwards the call.
 */
export async function cancelCustomerBookingAction(
  _prevState: CancelBookingState,
  formData: FormData,
): Promise<CancelBookingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const bookingReference = String(formData.get("booking_reference") ?? "");
  const reasonCategory = String(formData.get("reason_category") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  if (!bookingReference || !reasonCategory) return { error: GENERIC_ERROR };

  const { error } = await supabase.rpc("cancel_customer_booking", {
    p_booking_reference: bookingReference,
    p_reason: reasonCategory,
    p_details: details || undefined,
  });

  if (error) return { error: toSafeError(error.message) };

  revalidatePath(`/dashboard/sessions/${bookingReference}`);
  revalidatePath("/dashboard/sessions");
  revalidatePath("/dashboard");
  return { success: true };
}
