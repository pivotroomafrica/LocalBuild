import type { BookingStatus } from "@/types/booking";
import type { PaymentStatus } from "@/types/payment";

/**
 * Derived, presentation-only customer session state (Phase 7 spec section
 * 9). Combines booking_status with the latest payment row's payment_status
 * into one human label -- the raw DB booking_status/payment_status values
 * are never shown to a customer directly.
 */
export type DerivedSessionState =
  | "time_reserved"
  | "awaiting_payment"
  | "payment_processing"
  | "payment_verification_pending"
  | "payment_needs_attention"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "expired";

export const DERIVED_SESSION_STATE_LABELS: Record<DerivedSessionState, string> = {
  time_reserved: "Time Reserved",
  awaiting_payment: "Awaiting Payment",
  payment_processing: "Payment Processing",
  payment_verification_pending: "Payment Verification Pending",
  payment_needs_attention: "Payment Needs Attention",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

/**
 * Pure mapping (no I/O) from booking_status + the latest payment's
 * payment_status to the one derived state shown to the customer. Pass
 * `null` when the booking has no payment row yet (held, or awaiting_payment
 * with nothing submitted).
 */
export function deriveSessionState(
  bookingStatus: BookingStatus,
  latestPaymentStatus: PaymentStatus | null,
): DerivedSessionState {
  switch (bookingStatus) {
    case "held":
      return "time_reserved";
    case "awaiting_payment":
      if (latestPaymentStatus === "pending_verification") return "payment_verification_pending";
      if (latestPaymentStatus === "rejected") return "payment_needs_attention";
      if (latestPaymentStatus === "requires_review") return "payment_needs_attention";
      if (latestPaymentStatus === "initiated") return "payment_processing";
      return "awaiting_payment";
    case "confirmed":
      return "confirmed";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
  }
}

/** My Sessions tab grouping (spec section 6) -- derived from
 * DerivedSessionState, never from raw booking_status. */
export const SESSION_TABS = ["upcoming", "pending", "past"] as const;
export type SessionTab = (typeof SESSION_TABS)[number];

export function sessionTabForState(state: DerivedSessionState): SessionTab {
  switch (state) {
    case "confirmed":
      return "upcoming";
    case "time_reserved":
    case "awaiting_payment":
    case "payment_processing":
    case "payment_verification_pending":
    case "payment_needs_attention":
      return "pending";
    case "completed":
    case "cancelled":
    case "expired":
      return "past";
  }
}
