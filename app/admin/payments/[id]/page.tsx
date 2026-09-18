import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminPaymentDetail } from "@/lib/payment/data";
import { PaymentVerifyButton } from "@/components/admin/PaymentVerifyButton";
import { PaymentRejectForm } from "@/components/admin/PaymentRejectForm";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/types/payment";

export default async function AdminPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const detail = await getAdminPaymentDetail(supabase, id);
  if (!detail) notFound();

  const { payment } = detail;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/payments" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          &larr; Back to payments
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text)]">
          {detail.bookingReference}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Status: <span className="font-medium">{PAYMENT_STATUS_LABELS[payment.payment_status as PaymentStatus]}</span>
        </p>
      </div>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Booking</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Customer" value={detail.customerName} />
          <Field label="Expert" value={detail.expertName} />
          <Field
            label="Date & time"
            value={detail.bookingStartAt ? new Date(detail.bookingStartAt).toLocaleString() : "—"}
          />
          <Field label="Duration" value={`${detail.bookingDurationMinutes} minutes`} />
          <Field
            label="Format"
            value={SESSION_FORMAT_LABELS[detail.bookingFormat as "online" | "in_person"] ?? detail.bookingFormat}
          />
        </dl>
      </section>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Payment</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Method" value={payment.payment_method === "chapa" ? "Chapa" : "Manual Bank Transfer"} />
          <Field label="Expected amount" value={`${Number(payment.expected_amount).toLocaleString()} ${payment.currency}`} />
          <Field
            label="Amount paid"
            value={`${Number(payment.amount_paid).toLocaleString()} ${payment.currency}`}
            highlight={Number(payment.expected_amount) !== Number(payment.amount_paid)}
          />
          <Field label="Submitted" value={new Date(payment.submitted_at).toLocaleString()} />

          {payment.payment_method === "manual" ? (
            <>
              <Field label="Bank used" value={payment.bank_used ?? "—"} />
              <Field label="Transaction reference" value={payment.transaction_reference ?? "—"} />
            </>
          ) : (
            <>
              <Field label="Chapa tx_ref" value={payment.provider_tx_ref ?? "—"} />
              <Field label="Chapa reference" value={payment.provider_reference ?? "—"} />
              <Field label="Provider status" value={payment.provider_status ?? "—"} />
              <Field label="Mode" value={payment.provider_mode ?? "—"} />
              {payment.initialized_at ? (
                <Field label="Initialized" value={new Date(payment.initialized_at).toLocaleString()} />
              ) : null}
              {payment.verified_at ? (
                <Field label="Provider-verified" value={new Date(payment.verified_at).toLocaleString()} />
              ) : null}
            </>
          )}
        </dl>

        {Number(payment.expected_amount) !== Number(payment.amount_paid) ? (
          <p className="mt-3 rounded-md bg-[var(--color-danger-bg)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]">
            Amount mismatch: expected {Number(payment.expected_amount).toLocaleString()} {payment.currency}, customer
            reported paying {Number(payment.amount_paid).toLocaleString()} {payment.currency}.
          </p>
        ) : null}
        {detail.isDuplicateTransactionReference ? (
          <p className="mt-3 rounded-md bg-[var(--color-danger-bg)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]">
            This transaction reference also appears on another payment. Some banks reuse references
            -- verify carefully before approving.
          </p>
        ) : null}
        {payment.payment_status === "requires_review" ? (
          <p className="mt-3 rounded-md bg-[var(--color-danger-bg)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]">
            Chapa reported this payment as successful, but the booking&apos;s reservation was no
            longer safely confirmable when that was verified (e.g. it had already expired or been
            released). No booking has been confirmed from this payment. Investigate manually --
            check whether the slot is still available and coordinate with the customer before taking
            any action. Phase 8 does not auto-refund.
          </p>
        ) : null}

        {payment.payment_method === "manual" ? (
          detail.receiptSignedUrl ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">Receipt</p>
              <a
                href={detail.receiptSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[var(--color-brand)] hover:underline"
              >
                View receipt
              </a>
            </div>
          ) : (
            <p className="mt-4 text-xs text-[var(--color-text-muted)]">No receipt was uploaded.</p>
          )
        ) : null}
      </section>

      {payment.payment_status === "rejected" && payment.rejection_reason ? (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Rejection reason sent to customer</h2>
          <p className="text-sm text-[var(--color-text)]">{payment.rejection_reason}</p>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Review Decision</h2>
        {payment.payment_method === "manual" && payment.payment_status === "pending_verification" ? (
          <div className="flex flex-col gap-6">
            <PaymentVerifyButton paymentId={payment.id} />
            <PaymentRejectForm paymentId={payment.id} />
          </div>
        ) : payment.payment_method === "chapa" ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Chapa payments are confirmed automatically once verified directly against Chapa&apos;s
            API -- there is no manual &quot;mark paid&quot; action. {payment.payment_status === "requires_review"
              ? "This one needs manual investigation (see above), not a one-click resolution."
              : "Nothing to do here."}
          </p>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            This payment has already been {payment.payment_status === "verified" ? "verified" : "reviewed"}.
          </p>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--color-text-muted)]">{label}</dt>
      <dd className={`text-sm ${highlight ? "font-semibold text-[var(--color-danger)]" : "text-[var(--color-text)]"}`}>
        {value}
      </dd>
    </div>
  );
}
