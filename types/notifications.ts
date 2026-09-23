/**
 * Phase 9 -- shared types for the integration_jobs outbox (044). Mirrors
 * types/payment.ts's pattern: the raw DB string columns get a typed
 * union + label map here, once, rather than re-typed at every call site.
 */

export const INTEGRATION_JOB_TYPES = [
  "booking_confirmation_email_customer",
  "booking_confirmation_email_expert",
  "calendar_create",
  "session_reminder_customer",
  "session_reminder_expert",
  "payment_rejected_email",
  "calendar_update",
  "calendar_cancel",
  "reschedule_email_customer",
  "reschedule_email_expert",
  "cancellation_email_customer",
  "cancellation_email_expert",
  "reschedule_request_email_customer",
] as const;
export type IntegrationJobType = (typeof INTEGRATION_JOB_TYPES)[number];

export const INTEGRATION_JOB_TYPE_LABELS: Record<IntegrationJobType, string> = {
  booking_confirmation_email_customer: "Customer confirmation email",
  booking_confirmation_email_expert: "Expert confirmation email",
  calendar_create: "Calendar event",
  session_reminder_customer: "Customer reminder",
  session_reminder_expert: "Expert reminder",
  payment_rejected_email: "Payment rejected email",
  calendar_update: "Calendar event update",
  calendar_cancel: "Calendar event cancellation",
  reschedule_email_customer: "Customer reschedule email",
  reschedule_email_expert: "Expert reschedule email",
  cancellation_email_customer: "Customer cancellation email",
  cancellation_email_expert: "Expert cancellation email",
  reschedule_request_email_customer: "Reschedule request email",
};

export const INTEGRATION_JOB_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type IntegrationJobStatus = (typeof INTEGRATION_JOB_STATUSES)[number];

export const INTEGRATION_JOB_STATUS_LABELS: Record<IntegrationJobStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Sent",
  failed: "Failed",
};

/** Same named-constant pattern as every other Pivotroom policy constant
 * (booking_hold_minutes(), etc.) -- mirrored by hand from the SQL
 * function of the same name (044) for display/estimation purposes only;
 * the SQL function is the actual source of truth used at registration
 * time. */
export const SESSION_REMINDER_OFFSETS_MINUTES = [1440, 60] as const;

export const INTEGRATION_MAX_ATTEMPTS = 5;
