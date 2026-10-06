import Link from "next/link";
import type { CustomerSessionSummary } from "@/lib/dashboard/data";
import { formatSessionDateTime, pendingActionForSession } from "@/lib/dashboard/presentation";
import { SessionStatusPill } from "@/components/session/StatusPill";
import { SessionDateTile } from "@/components/session/SessionDateTile";

/** Dashboard overview's "something needs your attention" card (spec
 * sections 7-9) -- shows the derived state and, when there is one, the
 * single next action (Continue Booking / Complete Payment / View Payment
 * Status). Nothing to show for a state with no next action (there is no
 * such state reachable here: the overview only ever passes a held/
 * awaiting_payment booking into this card). */
export function PendingActionCard({ session }: { session: CustomerSessionSummary }) {
  const action = pendingActionForSession(session.derivedState, session.bookingReference);

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <SessionDateTile startAt={session.startAt} timezone={session.customerTimezone} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-[var(--color-text)]">{session.expertName}</p>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
              {formatSessionDateTime(session.startAt, session.customerTimezone)}
            </p>
          </div>
        </div>
        <SessionStatusPill state={session.derivedState} />
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex w-fit items-center justify-center rounded-full bg-[var(--color-brand)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--color-brand-hover)] shadow-[0_4px_14px_rgba(20,19,24,0.18)]"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
