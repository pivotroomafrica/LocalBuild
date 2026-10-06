import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerPage, getCustomerSessions } from "@/lib/dashboard/data";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { CustomerSessionCard } from "@/components/session/CustomerSessionCard";
import { SESSION_TABS, type SessionTab } from "@/types/session";

const TAB_LABELS: Record<SessionTab, string> = {
  upcoming: "Upcoming",
  pending: "Pending",
  past: "Past",
};

const EMPTY_COPY: Record<SessionTab, string> = {
  upcoming: "You don't have any upcoming confirmed sessions.",
  pending: "You don't have any bookings waiting on an action right now.",
  past: "You don't have any past sessions yet.",
};

function isValidTab(value: string | undefined): value is SessionTab {
  return Boolean(value && (SESSION_TABS as readonly string[]).includes(value));
}

/** My Sessions (spec section 6) -- Upcoming/Pending/Past, built entirely
 * from the derived session state, never the raw booking_status column. */
export default async function DashboardSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: SessionTab = isValidTab(params.tab) ? params.tab : "upcoming";

  const supabase = await createClient();
  const { userId } = await requireCustomerPage(supabase, "/dashboard/sessions");

  const sessions = await getCustomerSessions(supabase, userId, tab);

  return (
    <div>
      <DashboardNav current="/dashboard/sessions" />

      <div className="flex flex-col gap-6">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">My Sessions</h1>

        <nav className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--color-border)] bg-[var(--color-mist)] p-1">
          {SESSION_TABS.map((t) => (
            <Link
              key={t}
              href={`/dashboard/sessions?tab=${t}`}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-bold transition-all ${
                t === tab
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_1px_4px_rgba(20,19,24,0.12)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {TAB_LABELS[t]}
            </Link>
          ))}
        </nav>

        {sessions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{EMPTY_COPY[tab]}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li key={session.bookingId}>
                <CustomerSessionCard session={session} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
