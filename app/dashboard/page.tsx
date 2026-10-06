import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerPage, getDashboardOverview } from "@/lib/dashboard/data";
import { formatSessionDateTime } from "@/lib/dashboard/presentation";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { PendingActionCard } from "@/components/session/PendingActionCard";
import { SessionStatusPill } from "@/components/session/StatusPill";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import { SessionDateTile } from "@/components/session/SessionDateTile";

/** Dashboard overview (spec sections 6-8) -- prioritizes the next
 * confirmed session and the single most relevant actionable pending
 * booking, never the customer's full booking history. */
export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  const { userId } = await requireCustomerPage(supabase, "/dashboard");

  const { nextConfirmedSession, actionablePendingSession } = await getDashboardOverview(supabase, userId);

  const hasNothing = !nextConfirmedSession && !actionablePendingSession;

  return (
    <div>
      <DashboardNav current="/dashboard" />

      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">
            Overview
          </h1>
        </div>

        {hasNothing ? (
          <div className="relative overflow-hidden rounded-[26px] bg-[#121116] px-7 py-10 text-center text-white sm:px-12">
            <div aria-hidden="true" className="hero-glow-1" />
            <p className="relative text-xl font-extrabold tracking-[-0.02em]">You don&apos;t have any sessions yet.</p>
            <p className="relative mt-2 text-[15px] text-[#a9a6b2]">Browse our experts and book your first session.</p>
            <Link href="/experts" className="btn-hero-primary relative mt-6 inline-flex">
              Browse Experts
            </Link>
          </div>
        ) : (
          <>
            {nextConfirmedSession ? (
              <section>
                <h2 className="mb-3 text-[15px] font-extrabold tracking-[-0.01em] text-[var(--color-text)]">
                  Next Session
                </h2>
                <Link
                  href={`/dashboard/sessions/${nextConfirmedSession.bookingReference}`}
                  className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between shadow-[var(--shadow-card)] transition-all"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <SessionDateTile
                      startAt={nextConfirmedSession.startAt}
                      timezone={nextConfirmedSession.customerTimezone}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold text-[var(--color-text)]">
                        {nextConfirmedSession.expertName}
                      </p>
                      <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
                        {formatSessionDateTime(nextConfirmedSession.startAt, nextConfirmedSession.customerTimezone)} ·{" "}
                        {nextConfirmedSession.durationMinutes} min ·{" "}
                        {SESSION_FORMAT_LABELS[nextConfirmedSession.sessionFormat]}
                      </p>
                    </div>
                  </div>
                  <SessionStatusPill state={nextConfirmedSession.derivedState} />
                </Link>
              </section>
            ) : null}

            {actionablePendingSession ? (
              <section>
                <h2 className="mb-3 text-[15px] font-extrabold tracking-[-0.01em] text-[var(--color-text)]">
                  Needs Your Attention
                </h2>
                <PendingActionCard session={actionablePendingSession} />
              </section>
            ) : null}
          </>
        )}

        <Link href="/dashboard/sessions" className="text-sm font-medium text-[var(--color-accent)] hover:underline">
          View all sessions &rarr;
        </Link>
      </div>
    </div>
  );
}
