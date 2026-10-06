import Link from "next/link";
import type { ExpertSessionSummary } from "@/lib/expert/sessions";
import { formatExpertSessionDateTime } from "@/lib/expert/presentation";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import { SessionDateTile } from "@/components/session/SessionDateTile";
import { BookingStatusPill } from "@/components/session/StatusPill";

export function ExpertSessionCard({ session }: { session: ExpertSessionSummary }) {
  return (
    <Link
      href={`/expert/sessions/${session.bookingReference}`}
      className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between shadow-[var(--shadow-card)] transition-all"
    >
      <div className="flex min-w-0 items-center gap-4">
        <SessionDateTile startAt={session.startAt} timezone={session.expertTimezone} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-[var(--color-text)]">{session.customerName}</p>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
            {formatExpertSessionDateTime(session.startAt, session.expertTimezone)} · {session.durationMinutes} min ·{" "}
            {SESSION_FORMAT_LABELS[session.sessionFormat]}
          </p>
        </div>
      </div>
      <BookingStatusPill status={session.bookingStatus} />
    </Link>
  );
}
