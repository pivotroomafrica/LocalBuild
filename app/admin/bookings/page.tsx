import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminBookingList, ADMIN_BOOKING_TABS, type AdminBookingTab } from "@/lib/booking/data";
import { BookingStatusPill, PaymentStatusPill } from "@/components/session/StatusPill";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import type { PaymentStatus } from "@/types/payment";

const VALID_TABS = new Set(ADMIN_BOOKING_TABS.map((t) => t.tab));

function isValidTab(value: string | undefined): value is AdminBookingTab {
  return Boolean(value && VALID_TABS.has(value as AdminBookingTab));
}

/**
 * Admin booking visibility (spec section 39) -- minimal support view, kept
 * deliberately separate from /admin/payments (which this does not rebuild
 * or merge with; the two stay connected only via navigation and the
 * per-row link into the payment detail page).
 */
export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const params = await searchParams;
  const tab: AdminBookingTab = isValidTab(params.tab) ? params.tab : "all";
  const search = params.q?.trim() ?? "";

  const supabase = await createClient();
  const rows = await getAdminBookingList(supabase, tab, search);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">Bookings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          All bookings, for support visibility. Payment review happens on the Payments page.
        </p>
      </div>

      <nav className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--color-border)] bg-[var(--color-mist)] p-1">
        {ADMIN_BOOKING_TABS.map((t) => (
          <Link
            key={t.tab}
            href={`/admin/bookings?tab=${t.tab}`}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-bold transition-all ${
              t.tab === tab
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_1px_4px_rgba(20,19,24,0.12)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          type="text"
          name="q"
          defaultValue={search}
          placeholder="Search by booking reference"
          className="w-full max-w-sm rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        />
        <button
          type="submit"
          className="rounded-full border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-bold text-[var(--color-text)] hover:bg-[var(--color-bg)]"
        >
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No bookings in this view.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/bookings/${row.bookingReference}`}
                className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between shadow-[var(--shadow-card)] transition-all"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                    {row.bookingReference} · {row.customerName} &rarr; {row.expertName}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {new Date(row.startAt).toLocaleString()} · {row.durationMinutes} min ·{" "}
                    {SESSION_FORMAT_LABELS[row.sessionFormat]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <BookingStatusPill status={row.bookingStatus} />
                  {row.latestPaymentStatus ? (
                    <PaymentStatusPill status={row.latestPaymentStatus as PaymentStatus} />
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
