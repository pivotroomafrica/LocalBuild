/**
 * Expert-facing counterpart to lib/dashboard/presentation.ts's
 * formatSessionDateTime -- same Server Component timezone pitfall
 * (Intl/toLocaleString without an explicit timeZone renders in the
 * server's own zone, not the visitor's), fixed the same way, but always
 * against booking.expert_timezone (never null, unlike customer_timezone)
 * rather than the customer's.
 */
export function formatExpertSessionDateTime(startAt: string, expertTimezone: string): string {
  return new Date(startAt).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: expertTimezone,
  });
}
