import Link from "next/link";
import type { CustomerSessionSummary } from "@/lib/dashboard/data";
import { formatSessionDateTime } from "@/lib/dashboard/presentation";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import { SessionDateTile } from "@/components/session/SessionDateTile";
import { SessionStatusPill } from "@/components/session/StatusPill";

export function CustomerSessionCard({ session }: { session: CustomerSessionSummary }) {
  return (
    <Link
      href={`/dashboard/sessions/${session.bookingReference}`}
      className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between shadow-[var(--shadow-card)] transition-all"
    >
      <div className="flex min-w-0 items-center gap-4">
        <SessionDateTile startAt={session.startAt} timezone={session.customerTimezone} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-[var(--color-text)]">{session.expertName}</p>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
            {formatSessionDateTime(session.startAt, session.customerTimezone)} · {session.durationMinutes} min ·{" "}
            {SESSION_FORMAT_LABELS[session.sessionFormat]}
          </p>
        </div>
      </div>
      <SessionStatusPill state={session.derivedState} />
    </Link>
  );
}
