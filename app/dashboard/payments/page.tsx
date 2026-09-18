import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerPage, getCustomerPaymentHistory } from "@/lib/dashboard/data";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { PaymentStatusPill } from "@/components/session/StatusPill";
import type { PaymentStatus } from "@/types/payment";

/** Payment history (spec section 15) -- reads the generic `payments` table
 * directly, so this needs no changes when a future Chapa payment_method
 * starts appearing in the same rows alongside manual transfers. */
export default async function DashboardPaymentsPage() {
  const supabase = await createClient();
  const { userId } = await requireCustomerPage(supabase, "/dashboard/payments");

  const rows = await getCustomerPaymentHistory(supabase, userId);

  return (
    <div>
      <DashboardNav current="/dashboard/payments" />

      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Payments</h1>

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">You haven&apos;t submitted any payments yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map(({ payment, bookingReference, expertName }) => (
              <li key={payment.id}>
                <Link
                  href={`/dashboard/sessions/${bookingReference}`}
                  className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-brand)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">{expertName}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      {bookingReference} · Submitted {new Date(payment.submitted_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {Number(payment.amount_paid).toLocaleString()} {payment.currency}
                    </span>
                    <PaymentStatusPill status={payment.payment_status as PaymentStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
