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

/**
 * Mirrors payment_rejection_grace_minutes() in
 * 041_reservation_release_and_grace.sql -- the fresh, short window a
 * booking gets from the moment its payment is rejected, replacing
 * whatever was left of the original submission-time verification hold.
 * Display only, kept in sync by hand; the database is what actually
 * enforces it.
 */
export const PAYMENT_REJECTION_GRACE_MINUTES = 120;

export const PAYMENT_METHODS = ["manual", "chapa"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Every value either Phase 6 (manual) or Phase 8 (Chapa) code can write.
 * 'paid'/'refunded' remain in the database CHECK constraint but unused by
 * any current function -- reserved, same "widen the constraint once,
 * write it later" pattern Phase 6 originally used for Chapa's own values.
 */
export const REACHABLE_PAYMENT_STATUSES = [
  "pending_verification",
  "verified",
  "rejected",
  "initiated",
  "failed",
  "requires_review",
] as const;

export type PaymentStatus =
  | "pending_verification"
  | "verified"
  | "rejected"
  | "initiated"
  | "paid"
  | "failed"
  | "refunded"
  | "requires_review";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending_verification: "Pending Verification",
  verified: "Verified",
  rejected: "Payment Rejected",
  initiated: "Processing",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  requires_review: "Requires Review",
};

/**
 * Mirrors chapa_checkout_hold_minutes() in 042_chapa_payments.sql -- how
 * long a booking's slot stays reserved once a Chapa transaction has been
 * successfully initialized. Display only, kept in sync by hand; the
 * database is what actually enforces it.
 */
export const CHAPA_CHECKOUT_HOLD_MINUTES = 30;

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
