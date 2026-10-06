import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedExpertPage } from "@/lib/expert/auth";
import { getExpertNextSession } from "@/lib/expert/sessions";
import { formatExpertSessionDateTime } from "@/lib/expert/presentation";
import { ExpertOperationsNav } from "@/components/layout/ExpertOperationsNav";
import { BookingStatusPill } from "@/components/session/StatusPill";
import { SESSION_FORMAT_LABELS } from "@/types/booking";

/**
 * Expert dashboard overview (spec sections 20-23) -- just the next
 * confirmed session. An expert never sees a held/awaiting_payment/expired
 * booking here at all (spec section 25): getExpertNextSession explicitly
 * filters on this expert's own expertProfileId AND booking_status =
 * 'confirmed', in addition to (never instead of) bookings_select_own_
 * expert (039) -- see the function's own comment for why RLS alone isn't
 * sufficient for a dual-identity account.
 */
export default async function ExpertDashboardPage() {
  const supabase = await createClient();
  const { expertProfileId } = await requireApprovedExpertPage(supabase, "/expert/dashboard");

  const nextSession = await getExpertNextSession(supabase, expertProfileId);

  return (
    <div>
      <ExpertOperationsNav current="/expert/dashboard" />

      <div className="flex flex-col gap-8">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">Dashboard</h1>

        {nextSession ? (
          <section>
            <h2 className="mb-3 text-[15px] font-extrabold tracking-[-0.01em] text-[var(--color-text)]">Next Session</h2>
            <Link
              href={`/expert/sessions/${nextSession.bookingReference}`}
              className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between shadow-[var(--shadow-card)] transition-all"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--color-text)]">{nextSession.customerName}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {formatExpertSessionDateTime(nextSession.startAt, nextSession.expertTimezone)} ·{" "}
                  {nextSession.durationMinutes} min · {SESSION_FORMAT_LABELS[nextSession.sessionFormat]}
                </p>
              </div>
              <BookingStatusPill status={nextSession.bookingStatus} />
            </Link>
          </section>
        ) : (
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-card)]">
            <p className="text-sm text-[var(--color-text)]">No upcoming confirmed sessions.</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Confirmed sessions will appear here once a customer completes payment.
            </p>
          </div>
        )}

        <Link href="/expert/sessions" className="text-sm font-medium text-[var(--color-accent)] hover:underline">
          View all sessions &rarr;
        </Link>
      </div>
    </div>
  );
}
