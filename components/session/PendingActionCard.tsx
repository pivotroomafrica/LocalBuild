import Link from "next/link";
import type { CustomerSessionSummary } from "@/lib/dashboard/data";
import { formatSessionDateTime, pendingActionForSession } from "@/lib/dashboard/presentation";
import { SessionStatusPill } from "@/components/session/StatusPill";

/** Dashboard overview's "something needs your attention" card (spec
 * sections 7-9) -- shows the derived state and, when there is one, the
 * single next action (Continue Booking / Complete Payment / View Payment
 * Status). Nothing to show for a state with no next action (there is no
 * such state reachable here: the overview only ever passes a held/
 * awaiting_payment booking into this card). */
export function PendingActionCard({ session }: { session: CustomerSessionSummary }) {
  const action = pendingActionForSession(session.derivedState, session.bookingReference);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--color-text)]">{session.expertName}</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {formatSessionDateTime(session.startAt, session.customerTimezone)}
          </p>
        </div>
        <SessionStatusPill state={session.derivedState} />
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
