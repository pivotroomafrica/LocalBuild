import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerPage, getDashboardOverview } from "@/lib/dashboard/data";
import { formatSessionDateTime } from "@/lib/dashboard/presentation";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { PendingActionCard } from "@/components/session/PendingActionCard";
import { SessionStatusPill } from "@/components/session/StatusPill";
import { SESSION_FORMAT_LABELS } from "@/types/booking";

/** Dashboard overview (spec sections 6-8) -- prioritizes the next
 * confirmed session and the single most relevant actionable pending
 * booking, never the customer's full booking history. */
export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  await requireCustomerPage(supabase, "/dashboard");

  const { nextConfirmedSession, actionablePendingSession } = await getDashboardOverview(supabase);

  const hasNothing = !nextConfirmedSession && !actionablePendingSession;

  return (
    <div>
      <DashboardNav current="/dashboard" />

      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Overview</h1>
        </div>

        {hasNothing ? (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
            <p className="text-sm text-[var(--color-text)]">You don&apos;t have any sessions yet.</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Browse our experts and book your first session.
            </p>
            <Link
              href="/experts"
              className="mt-4 inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
            >
              Browse Experts
            </Link>
          </div>
        ) : (
          <>
            {nextConfirmedSession ? (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Next Session</h2>
                <Link
                  href={`/dashboard/sessions/${nextConfirmedSession.bookingReference}`}
                  className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-brand)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                      {nextConfirmedSession.expertName}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      {formatSessionDateTime(
                        nextConfirmedSession.startAt,
                        nextConfirmedSession.customerTimezone,
                      )}{" "}
                      · {nextConfirmedSession.durationMinutes} min ·{" "}
                      {SESSION_FORMAT_LABELS[nextConfirmedSession.sessionFormat]}
                    </p>
                  </div>
                  <SessionStatusPill state={nextConfirmedSession.derivedState} />
                </Link>
              </section>
            ) : null}

            {actionablePendingSession ? (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Needs Your Attention</h2>
                <PendingActionCard session={actionablePendingSession} />
              </section>
            ) : null}
          </>
        )}

        <Link
          href="/dashboard/sessions"
          className="text-sm font-medium text-[var(--color-brand)] hover:underline"
        >
          View all sessions &rarr;
        </Link>
      </div>
    </div>
  );
}
