"use server";

import { createClient } from "@/lib/supabase/server";
import { getBookingByReference } from "@/lib/booking/data";
import { verifyAndFinalizeChapaTransaction } from "@/lib/chapa/verify";

/**
 * "Check payment status" for a client waiting on Chapa: asks Chapa's
 * Verify API about the booking's latest in-flight attempt and finalizes it
 * (idempotently, same path as the webhook and the return page). Ownership
 * is checked here; the tx_ref is looked up server-side, never taken from
 * the browser.
 */
export async function checkChapaPaymentAction(bookingReference: string): Promise<{ status: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unknown" };

  const booking = await getBookingByReference(supabase, bookingReference);
  if (!booking || booking.customer_id !== user.id) return { status: "unknown" };

  const { data: payment } = await supabase
    .from("payments")
    .select("provider_tx_ref")
    .eq("booking_id", booking.id)
    .eq("payment_method", "chapa")
    .eq("payment_status", "initiated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!payment?.provider_tx_ref) return { status: "none" };

  const outcome = await verifyAndFinalizeChapaTransaction(payment.provider_tx_ref);
  return { status: outcome.finalPaymentStatus };
}
