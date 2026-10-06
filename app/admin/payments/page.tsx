import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminPaymentList, ADMIN_PAYMENT_TABS, type AdminPaymentTab } from "@/lib/payment/data";

const VALID_TABS = new Set(ADMIN_PAYMENT_TABS.map((t) => t.tab));

function isValidTab(value: string | undefined): value is AdminPaymentTab {
  return Boolean(value && VALID_TABS.has(value as AdminPaymentTab));
}

/** Simple admin payment queue (spec section 21) -- three lifecycle tabs,
 * no finance CRM. */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab: AdminPaymentTab = isValidTab(params.tab) ? params.tab : "pending_verification";

  const supabase = await createClient();
  const rows = await getAdminPaymentList(supabase, tab);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">Payments</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Review bank-transfer submissions and Chapa payment attempts. Chapa payments confirm
          automatically once verified against Chapa&apos;s API -- only manual transfers need a
          Verify/Reject decision here.
        </p>
      </div>

      <nav className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--color-border)] bg-[var(--color-mist)] p-1">
        {ADMIN_PAYMENT_TABS.map((t) => (
          <Link
            key={t.tab}
            href={`/admin/payments?tab=${t.tab}`}
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

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No payments in this view.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/payments/${row.id}`}
                className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between shadow-[var(--shadow-card)] transition-all"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    {row.bookingReference} · {row.customerName} → {row.expertName}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {row.paymentMethod === "chapa"
                      ? `Chapa · tx_ref: ${row.providerTxRef ?? "—"}`
                      : `${row.bankUsed ?? "—"} · Ref: ${row.transactionReference ?? "—"}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {row.amountPaid.toLocaleString()} {row.currency}
                    {row.amountMismatch ? (
                      <span className="ml-2 rounded-full bg-[var(--color-danger-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--color-danger)]">
                        Amount mismatch
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {new Date(row.submittedAt).toLocaleString()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
