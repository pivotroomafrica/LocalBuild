import type { Tables } from "@/types/database";

export type Booking = Tables<"bookings">;
export type BookingIntake = Tables<"booking_intake">;
export type BookingReschedule = Tables<"booking_reschedules">;
export type BookingCancellation = Tables<"booking_cancellations">;
export type BookingChangeRequest = Tables<"booking_change_requests">;

/**
 * One centralized source per constant (spec section 18) -- mirrors the
 * SQL functions of the same name in 034_booking_functions.sql
 * (booking_slot_increment_minutes(), booking_hold_minutes(),
 * booking_min_notice_hours(), booking_horizon_days()). Those functions are
 * the actual enforcement; these are kept in sync by hand for client-side
 * display only (a countdown, a "book up to 90 days ahead" note) -- never
 * used to decide whether a hold is still valid, which is always the
 * server's job.
 */
export const BOOKING_SLOT_INCREMENT_MINUTES = 15;
export const BOOKING_HOLD_MINUTES = 15;
export const BOOKING_MIN_NOTICE_HOURS = 24;
export const BOOKING_HORIZON_DAYS = 90;

export const SESSION_FORMATS = ["online", "in_person"] as const;
export type SessionFormat = (typeof SESSION_FORMATS)[number];

export const SESSION_FORMAT_LABELS: Record<SessionFormat, string> = {
  online: "Online",
  in_person: "In Person",
};

/**
 * Only the values Phase 5 code can ever write
 * (create_booking_hold/advance_booking_to_awaiting_payment/expiry). The
 * database CHECK constraint also allows "confirmed"/"completed"/
 * "cancelled" so a future payment phase needs no new migration to reach
 * them, but no Phase 5 function writes those values -- see
 * BOOKING_STATUS_LABELS below for the full display vocabulary.
 */
export const REACHABLE_BOOKING_STATUSES = ["held", "awaiting_payment", "expired"] as const;

export type BookingStatus =
  | "held"
  | "awaiting_payment"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "expired";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  held: "Time Reserved",
  awaiting_payment: "Ready for Payment",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** One bookable moment returned by get_bookable_slots() -- never a raw
 * availability or booking row, see 034's own comment on that function. */
export type BookableSlot = {
  startAt: string; // ISO timestamptz
  endAt: string; // ISO timestamptz
  expertTimezone: string;
};

/** The selection carried through duration -> format -> date & time ->
 * auth round-trip -> intake -> review, encoded into the login/signup
 * `next` URL so it survives the auth redirect (spec section 27). */
export type BookingSelection = {
  expertSlug: string;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  startAt: string; // ISO timestamptz, the exact candidate the customer picked
};

/** Booking-specific preparation questions (spec sections 50-53) -- NOT
 * part of the permanent customer_profiles professional profile. */
export type BookingIntakeInput = {
  discussion_topic: string;
  additional_context: string;
  materials_to_review: string;
};

export const DISCUSSION_TOPIC_MAX_LENGTH = 500;
export const ADDITIONAL_CONTEXT_MAX_LENGTH = 1500;
export const MATERIALS_TO_REVIEW_MAX_LENGTH = 1000;

/**
 * Phase 10 (spec sections 2-3) -- server time only, enforced by
 * customer_reschedule_cutoff_hours()/customer_cancel_cutoff_hours() in
 * 045_phase10_reschedule_cancellation.sql. Kept in sync here by hand for
 * client-side display only (spec section 12's "you can reschedule/cancel
 * up to 24 hours before" copy) -- never used to decide whether the
 * action is actually still allowed, which is always the server's job via
 * reschedule_booking()/cancel_customer_booking() themselves.
 */
export const CUSTOMER_RESCHEDULE_CUTOFF_HOURS = 24;
export const CUSTOMER_CANCEL_CUTOFF_HOURS = 24;

/** Suggested reason categories for customer cancellation (spec section
 * 36) -- purely a UI convenience folded into the one free-text `reason`
 * cancel_customer_booking() stores; the database does not enforce this
 * list. */
export const CANCELLATION_REASON_CATEGORIES = [
  "Schedule conflict",
  "No longer needed",
  "Booked by mistake",
  "Other",
] as const;
export type CancellationReasonCategory = (typeof CANCELLATION_REASON_CATEGORIES)[number];
