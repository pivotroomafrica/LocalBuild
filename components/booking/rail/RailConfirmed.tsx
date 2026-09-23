import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SESSION_FORMAT_LABELS, type Booking } from "@/types/booking";

/**
 * CONFIRMED (spec state 9) -- replaces the rail entirely, it never sits
 * alongside a "book again" affordance for this same slot. Never invents a
 * meeting link: booking.calendar_meeting_url (Phase 9) is null until the
 * Google Calendar sync job actually completes, so this shows the same
 * "being prepared" honesty the dashboard session-detail pages already
 * use, rather than a fake/pending link. Never auto-navigates away from
 * the expert profile -- "View my sessions" is an explicit link, not a
 * redirect.
 */
export function RailConfirmed({ booking, customerTimezone }: { booking: Booking; customerTimezone?: string }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-success)]">
        <Icon name="check_circle" size={18} decorative />
        Confirmed
      </div>
      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">Booking confirmed</h2>

      <dl className="flex flex-col gap-2 rounded-[var(--radius-input)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
        <div className="flex justify-between">
          <dt className="text-[var(--color-text-muted)]">Date & time</dt>
          <dd className="font-medium">
            {new Date(booking.start_at).toLocaleString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: customerTimezone || undefined,
            })}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-text-muted)]">Duration</dt>
          <dd className="font-medium">{booking.duration_minutes} minutes</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-text-muted)]">Format</dt>
          <dd className="font-medium">{SESSION_FORMAT_LABELS[booking.session_format as "online" | "in_person"]}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
          <dd className="font-medium">{booking.booking_reference}</dd>
        </div>
      </dl>

      {booking.session_format === "online" ? (
        booking.calendar_meeting_url ? (
          <a
            href={booking.calendar_meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-brand)] px-7 text-sm font-medium text-[var(--color-on-brand)] transition-colors hover:bg-[var(--color-brand-hover)]"
          >
            Join Google Meet
          </a>
        ) : (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">Meeting details are being prepared.</p>
        )
      ) : null}

      <Link
        href="/dashboard/sessions"
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-7 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
      >
        View my sessions
      </Link>
    </section>
  );
}
