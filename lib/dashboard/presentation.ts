import type { DerivedSessionState } from "@/types/session";

/**
 * Server Components render with the SERVER's runtime timezone unless a
 * timeZone is passed explicitly to Intl/toLocaleString -- unlike a
 * "use client" component, which correctly reflects the visitor's browser.
 * Every date shown to a customer must pass booking.customer_timezone
 * (falling back to UTC for the rare pre-Phase-5-capture null) so the
 * display is correct regardless of where the app happens to be running.
 */
export function formatSessionDateTime(startAt: string, customerTimezone: string | null): string {
  return new Date(startAt).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: customerTimezone ?? "UTC",
  });
}

export function formatSessionDateShort(startAt: string, customerTimezone: string | null): string {
  return new Date(startAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: customerTimezone ?? "UTC",
  });
}

export type PendingAction = { label: string; href: string };

/** What a customer can actually do next for one non-final session state
 * (spec section 9's pending states) -- null for states with no next
 * action (confirmed/completed/cancelled/expired all just get viewed). */
export function pendingActionForSession(
  derivedState: DerivedSessionState,
  bookingReference: string,
): PendingAction | null {
  switch (derivedState) {
    case "time_reserved":
      return { label: "Continue Booking", href: `/booking/${bookingReference}` };
    case "awaiting_payment":
    case "payment_needs_attention":
      return { label: "Complete Payment", href: `/booking/${bookingReference}/payment` };
    case "payment_verification_pending":
      return { label: "View Payment Status", href: `/booking/${bookingReference}/payment` };
    default:
      return null;
  }
}
