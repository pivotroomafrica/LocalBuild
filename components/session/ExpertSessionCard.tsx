import Link from "next/link";
import type { ExpertSessionSummary } from "@/lib/expert/sessions";
import { formatExpertSessionDateTime } from "@/lib/expert/presentation";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import { BookingStatusPill } from "@/components/session/StatusPill";

export function ExpertSessionCard({ session }: { session: ExpertSessionSummary }) {
  return (
    <Link
      href={`/expert/sessions/${session.bookingReference}`}
      className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-brand)] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--color-text)]">{session.customerName}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {formatExpertSessionDateTime(session.startAt, session.expertTimezone)} · {session.durationMinutes} min ·{" "}
          {SESSION_FORMAT_LABELS[session.sessionFormat]}
        </p>
      </div>
      <BookingStatusPill status={session.bookingStatus} />
    </Link>
  );
}
