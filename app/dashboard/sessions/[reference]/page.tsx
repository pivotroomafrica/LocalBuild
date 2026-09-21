import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerPage, getCustomerSessionDetail } from "@/lib/dashboard/data";
import { formatSessionDateTime, pendingActionForSession } from "@/lib/dashboard/presentation";
import { SessionStatusPill, PaymentStatusPill } from "@/components/session/StatusPill";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import type { PaymentStatus } from "@/types/payment";

/**
 * Session detail (spec sections 12-14). Ownership is enforced both by RLS
 * and by an explicit customer_id check inside getCustomerSessionDetail --
 * a reference belonging to another customer, or one only reachable
 * through some other permissive policy, resolves to notFound() here, the
 * same response as a reference that doesn't exist at all (spec section
 * 52).
 *
 * Never shows a fake meeting URL -- booking.calendar_meeting_url (Phase 9,
 * 044) only ever gets a real Google Meet link the calendar_create job
 * actually received from Google, and only for an online session; until
 * then (or for in-person, which never gets one) this shows a plain
 * "being prepared"/"will be provided" note instead of inventing one.
 * There is still no in-person location field, so that side is unchanged
 * from Phase 7.
 */
export default async function DashboardSessionDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const supabase = await createClient();
  const { userId } = await requireCustomerPage(supabase, `/dashboard/sessions/${reference}`);

  const detail = await getCustomerSessionDetail(supabase, userId, reference);
  if (!detail) notFound();

  const { booking, intake, payments, derivedState } = detail;
  const action = pendingActionForSession(derivedState, booking.booking_reference);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/dashboard/sessions" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          &larr; Back to My Sessions
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">{detail.expertName}</h1>
          <SessionStatusPill state={derivedState} />
        </div>
      </div>

      {action ? (
        <Link
          href={action.href}
          className="inline-flex w-fit items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          {action.label}
        </Link>
      ) : null}

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Session</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Date & time" value={formatSessionDateTime(booking.start_at, booking.customer_timezone)} />
          <Field label="Duration" value={`${booking.duration_minutes} minutes`} />
          <Field
            label="Format"
            value={SESSION_FORMAT_LABELS[booking.session_format as "online" | "in_person"] ?? booking.session_format}
          />
          <Field label="Booking reference" value={booking.booking_reference} />
        </dl>
        <div className="mt-3 text-xs text-[var(--color-text-muted)]">
          {booking.session_format === "online" ? (
            booking.calendar_meeting_url ? (
              <a
                href={booking.calendar_meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[var(--color-brand)] hover:underline"
              >
                Join Google Meet
              </a>
            ) : booking.booking_status === "confirmed" ? (
              "Meeting details are being prepared."
            ) : (
              "Meeting details will appear here before your session."
            )
          ) : (
            "Meeting location will be provided before your session."
          )}
        </div>
      </section>

      {intake ? (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">What You Wanted to Discuss</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <Field label="Discussion topic" value={intake.discussion_topic} block />
            <Field label="Additional context" value={intake.additional_context} block />
            {intake.materials_to_review ? (
              <Field label="Materials to review" value={intake.materials_to_review} block />
            ) : null}
          </dl>
        </section>
      ) : null}

      {payments.length > 0 ? (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Payment</h2>
          <ul className="flex flex-col gap-3">
            {payments.map((payment) => (
              <li key={payment.id} className="rounded-md bg-[var(--color-bg)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {Number(payment.amount_paid).toLocaleString()} {payment.currency}
                  </span>
                  <PaymentStatusPill status={payment.payment_status as PaymentStatus} />
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Submitted {new Date(payment.submitted_at).toLocaleDateString()}
                </p>
                {payment.payment_status === "rejected" && payment.rejection_reason ? (
                  <p className="mt-2 text-sm text-[var(--color-danger)]">{payment.rejection_reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, value, block = false }: { label: string; value: string; block?: boolean }) {
  if (block) {
    return (
      <div>
        <dt className="text-xs font-medium text-[var(--color-text-muted)]">{label}</dt>
        <dd className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text)]">{value}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-xs font-medium text-[var(--color-text-muted)]">{label}</dt>
      <dd className="text-sm text-[var(--color-text)]">{value}</dd>
    </div>
  );
}
