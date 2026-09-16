"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBookingByReference } from "@/lib/booking/data";
import { RECEIPT_ALLOWED_TYPES, RECEIPT_MAX_BYTES } from "@/types/payment";

const GENERIC_ERROR = "We couldn't submit that. Please try again.";

/**
 * The SQL functions in 038_payment_functions.sql only ever raise messages
 * written to be shown to a customer/admin as-is (spec section 47 /
 * Phase 5's same discipline) -- never a raw Postgres/Supabase error,
 * constraint name, or stack trace.
 */
function toSafeError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR;
  const knownFragments = [
    "logged in",
    "Booking not found",
    "reserved time expired",
    "booking details first",
    "no longer awaiting payment",
    "bank you transferred from",
    "transaction or reference",
    "amount you paid",
    "Not authorized",
    "Payment not found",
    "no longer pending verification",
    "explain why this payment",
    "Rejection reason",
  ];
  return knownFragments.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : GENERIC_ERROR;
}

export type SubmitPaymentState = {
  error?: string;
  success?: boolean;
};

function sanitizeFilename(name: string): string {
  const trimmed = name.trim().slice(-100);
  return trimmed.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "receipt";
}

/**
 * Manual-payment submission (spec sections 7-11, 61). The receipt file
 * (if any) is uploaded to Storage first, scoped to
 * "<customer_id>/<booking_id>/<random>-<name>" using the AUTHENTICATED
 * user's own id -- never a client-supplied customer_id -- so Storage RLS
 * (payment_receipt_insert_own, 037) can never be satisfied by a
 * cross-user path regardless of what this function constructs. The
 * resulting path (not the file) is then handed to submit_manual_payment()
 * (038), which is the only place the payments row itself is created and
 * which independently re-derives the booking/customer/expected amount
 * from the server, never trusting this action's own booking lookup.
 */
export async function submitManualPaymentAction(
  _prevState: SubmitPaymentState,
  formData: FormData,
): Promise<SubmitPaymentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const bookingReference = String(formData.get("booking_reference") ?? "");
  const bankUsed = String(formData.get("bank_used") ?? "");
  const transactionReference = String(formData.get("transaction_reference") ?? "");
  const rawAmount = String(formData.get("amount_paid") ?? "");
  const amountPaid = Number(rawAmount);

  if (!bookingReference) return { error: GENERIC_ERROR };
  if (!bankUsed.trim()) return { error: "Please enter the bank you transferred from." };
  if (!transactionReference.trim()) return { error: "Please enter your transaction or reference ID." };
  if (!rawAmount || !Number.isFinite(amountPaid) || amountPaid <= 0) {
    return { error: "Please enter the amount you paid." };
  }

  // Resolved here only to build the receipt's storage path -- ownership
  // and every other fact about the booking is independently re-verified
  // inside submit_manual_payment() itself.
  const booking = await getBookingByReference(supabase, bookingReference);
  if (!booking) return { error: "Booking not found." };

  let receiptPath: string | undefined;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (!RECEIPT_ALLOWED_TYPES.includes(file.type)) {
      return { error: "Please upload a JPG, PNG, WebP, or PDF file." };
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      return { error: "This receipt is too large. Please choose a smaller file (max 5 MB)." };
    }

    const path = `${user.id}/${booking.id}/${randomUUID()}-${sanitizeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("manual-payment-receipts")
      .upload(path, file, { contentType: file.type });
    if (uploadError) return { error: "We couldn't upload your receipt. Please try again." };
    receiptPath = path;
  }

  const { error } = await supabase.rpc("submit_manual_payment", {
    p_booking_reference: bookingReference,
    p_bank_used: bankUsed,
    p_transaction_reference: transactionReference,
    p_amount_paid: amountPaid,
    p_receipt_path: receiptPath,
  });

  if (error) return { error: toSafeError(error.message) };

  revalidatePath(`/booking/${bookingReference}/payment`);
  return { success: true };
}

export type AdminPaymentActionState = {
  error?: string;
  success?: boolean;
};

/** Admin-only (enforced inside verify_manual_payment(), 038) -- atomically
 * transitions the payment to verified AND the booking to confirmed. */
export async function verifyPaymentAction(
  _prevState: AdminPaymentActionState,
  formData: FormData,
): Promise<AdminPaymentActionState> {
  const supabase = await createClient();
  const paymentId = String(formData.get("payment_id") ?? "");
  if (!paymentId) return { error: GENERIC_ERROR };

  const { error } = await supabase.rpc("verify_manual_payment", { p_payment_id: paymentId });
  if (error) return { error: toSafeError(error.message) };

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/payments/${paymentId}`);
  return { success: true };
}

/** Admin-only (enforced inside reject_manual_payment(), 038) -- requires
 * a reason; the booking is never touched, so the customer can resubmit. */
export async function rejectPaymentAction(
  _prevState: AdminPaymentActionState,
  formData: FormData,
): Promise<AdminPaymentActionState> {
  const supabase = await createClient();
  const paymentId = String(formData.get("payment_id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  if (!paymentId) return { error: GENERIC_ERROR };
  if (!reason.trim()) return { error: "Please explain why this payment is being rejected." };

  const { error } = await supabase.rpc("reject_manual_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) return { error: toSafeError(error.message) };

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/payments/${paymentId}`);
  return { success: true };
}
