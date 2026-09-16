import Link from "next/link";
import type { CustomerSessionSummary } from "@/lib/dashboard/data";
import { formatSessionDateTime } from "@/lib/dashboard/presentation";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import { SessionStatusPill } from "@/components/session/StatusPill";

export function CustomerSessionCard({ session }: { session: CustomerSessionSummary }) {
  return (
    <Link
      href={`/dashboard/sessions/${session.bookingReference}`}
      className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-brand)] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--color-text)]">{session.expertName}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          {formatSessionDateTime(session.startAt, session.customerTimezone)} · {session.durationMinutes} min ·{" "}
          {SESSION_FORMAT_LABELS[session.sessionFormat]}
        </p>
      </div>
      <SessionStatusPill state={session.derivedState} />
    </Link>
  );
}
