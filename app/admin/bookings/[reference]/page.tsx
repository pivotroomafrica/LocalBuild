import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminBookingDetail } from "@/lib/booking/data";
import { BookingStatusPill, PaymentStatusPill } from "@/components/session/StatusPill";
import { AdminReleaseButton } from "@/components/admin/AdminReleaseButton";
import { SESSION_FORMAT_LABELS, type BookingStatus } from "@/types/booking";
import type { PaymentStatus } from "@/types/payment";

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const supabase = await createClient();

  const detail = await getAdminBookingDetail(supabase, reference);
  if (!detail) notFound();

  const { booking, intake, customerName, expertName, expertSlug, payments } = detail;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/bookings" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          &larr; Back to bookings
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">{booking.booking_reference}</h1>
          <BookingStatusPill status={booking.booking_status as BookingStatus} />
          {booking.booking_status === "held" || booking.booking_status === "awaiting_payment" ? (
            <AdminReleaseButton bookingId={booking.id} bookingReference={booking.booking_reference} />
          ) : null}
        </div>
      </div>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Booking</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Customer" value={customerName} />
          <Field
            label="Expert"
            value={expertSlug ? `${expertName} (${expertSlug})` : expertName}
          />
          <Field label="Date & time" value={new Date(booking.start_at).toLocaleString()} />
          <Field label="Duration" value={`${booking.duration_minutes} minutes`} />
          <Field
            label="Format"
            value={SESSION_FORMAT_LABELS[booking.session_format as "online" | "in_person"] ?? booking.session_format}
          />
          <Field label="Base price" value={`${Number(booking.base_price).toLocaleString()} ${booking.currency}`} />
        </dl>
      </section>

      {intake ? (
        <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Intake</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <Field label="Discussion topic" value={intake.discussion_topic} block />
            <Field label="Additional context" value={intake.additional_context} block />
            {intake.materials_to_review ? (
              <Field label="Materials to review" value={intake.materials_to_review} block />
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No payment submitted yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 rounded-md bg-[var(--color-bg)] p-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {Number(payment.amount_paid).toLocaleString()} {payment.currency}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Submitted {new Date(payment.submitted_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <PaymentStatusPill status={payment.payment_status as PaymentStatus} />
                  <Link
                    href={`/admin/payments/${payment.id}`}
                    className="text-sm font-medium text-[var(--color-brand)] hover:underline"
                  >
                    Review
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
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
