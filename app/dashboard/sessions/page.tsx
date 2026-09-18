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
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">My Sessions</h1>

        <nav className="flex flex-wrap gap-1 border-b border-[var(--color-border)]">
          {SESSION_TABS.map((t) => (
            <Link
              key={t}
              href={`/dashboard/sessions?tab=${t}`}
              className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                t === tab
                  ? "border-b-2 border-[var(--color-brand)] text-[var(--color-brand)]"
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
