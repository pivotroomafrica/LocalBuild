import type { Tables } from "@/types/database";

export type Payment = Tables<"payments">;

/**
 * Mirrors manual_payment_verification_hold_hours() in
 * 038_payment_functions.sql -- that function is the actual enforcement
 * (internal-only, not queryable by the client); this constant is kept in
 * sync by hand for display only (e.g. "reserved while we verify your
 * payment"), never used to decide whether a booking's hold is still
 * valid.
 */
export const MANUAL_PAYMENT_VERIFICATION_HOLD_HOURS = 24;

export const PAYMENT_METHODS = ["manual"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Only the values Phase 6 code can ever write
 * (submit_manual_payment/verify_manual_payment/reject_manual_payment).
 * The database CHECK constraint also allows 'initiated'/'paid'/'failed'/
 * 'refunded' so a future Chapa phase needs no new migration to reach
 * them, but no Phase 6 function writes those values.
 */
export const REACHABLE_PAYMENT_STATUSES = ["pending_verification", "verified", "rejected"] as const;

export type PaymentStatus =
  | "pending_verification"
  | "verified"
  | "rejected"
  | "initiated"
  | "paid"
  | "failed"
  | "refunded";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending_verification: "Pending Verification",
  verified: "Verified",
  rejected: "Payment Rejected",
  initiated: "Initiated",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

export const TRANSACTION_REFERENCE_MAX_LENGTH = 200;
export const BANK_USED_MAX_LENGTH = 150;
export const REJECTION_REASON_MAX_LENGTH = 2000;

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB, matches the bucket's file_size_limit
export const RECEIPT_ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];

/** Fields a customer submits on the manual-payment form
 * (submit_manual_payment(), 038). The receipt file itself is uploaded to
 * Storage separately by the server action; only the resulting path
 * travels alongside these. */
export type ManualPaymentInput = {
  bank_used: string;
  transaction_reference: string;
  amount_paid: string;
};
