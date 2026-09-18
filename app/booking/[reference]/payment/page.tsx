import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBookingByReference, getExpertSlugForBooking, isHoldExpired } from "@/lib/booking/data";
import { getPublicExpertProfile } from "@/lib/public/data";
import {
  getActivePaymentForBooking,
  getActiveChapaAttemptForBooking,
  getPaymentsForBooking,
  getLatestPaymentForBooking,
} from "@/lib/payment/data";
import { getBankConfig } from "@/lib/payment/bankConfig";
import { isChapaConfigured } from "@/lib/chapa/config";
import { formatSessionDateTime } from "@/lib/dashboard/presentation";
import { ManualPaymentForm } from "@/components/payment/ManualPaymentForm";
import { ChapaPayButton } from "@/components/payment/ChapaPayButton";
import { ReleaseTimeButton } from "@/components/booking/ReleaseTimeButton";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { FormMessage } from "@/components/ui/FormMessage";
import { SESSION_FORMAT_LABELS } from "@/types/booking";
import { PAYMENT_STATUS_LABELS } from "@/types/payment";

/**
 * Phase 6: the functional manual-payment page, replacing Phase 5's
 * placeholder. Every state below is derived directly from the booking's
 * actual server-side status and its payment history -- never from local
 * React state -- so a refresh always recovers correctly (same discipline
 * as the Phase 5 booking journey, spec section 59's equivalent for
 * payment).
 *
 * Never shows "Payment successful" or "Booking Confirmed" until
 * booking_status genuinely reads 'confirmed' (spec sections 19, 47, 56)
 * -- that value is only ever written by verify_manual_payment() (038),
 * an admin-only, atomic transition.
 *
 * Ownership enforced both by RLS (bookings_select_own, 033) and an
 * explicit `customer_id === user.id` re-check -- a reference reachable
 * only through some OTHER permissive policy (e.g. this same account being
 * the expert on that booking, bookings_select_own_expert, 039) resolves
 * to notFound() here, same as one that doesn't exist.
 */
export default async function BookingPaymentPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/booking/${reference}/payment`)}`);

  const booking = await getBookingByReference(supabase, reference);
  if (!booking || booking.customer_id !== user.id) notFound();

  if (booking.booking_status === "confirmed") {
    const expertSlug = await getExpertSlugForBooking(supabase, booking.id);
    const expertProfile = expertSlug ? await getPublicExpertProfile(supabase, expertSlug) : null;

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Booking Confirmed</h1>
          <dl className="flex flex-col gap-2 text-sm text-[var(--color-text)]">
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Expert</dt>
              <dd className="font-medium">{expertProfile?.fullName ?? "Your expert"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Date & time</dt>
              <dd className="font-medium">
                {formatSessionDateTime(booking.start_at, booking.customer_timezone)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Duration</dt>
              <dd className="font-medium">{booking.duration_minutes} minutes</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Format</dt>
              <dd className="font-medium">
                {SESSION_FORMAT_LABELS[booking.session_format as "online" | "in_person"]}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
              <dd className="font-medium">{booking.booking_reference}</dd>
            </div>
          </dl>
          {booking.session_format === "online" ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              Meeting details will be added before your session.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (isHoldExpired(booking)) redirect(`/booking/${reference}`);
  if (booking.booking_status !== "awaiting_payment") redirect(`/booking/${reference}`);

  const activePayment = await getActivePaymentForBooking(supabase, booking.id);
  const bank = getBankConfig();

  if (activePayment) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Payment Submitted</h1>
            <ReleaseTimeButton bookingId={booking.id} bookingReference={booking.booking_reference} />
          </div>
          <p className="text-sm text-[var(--color-text)]">Your transfer is waiting for verification.</p>
          <dl className="flex flex-col gap-2 text-sm text-[var(--color-text)]">
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
              <dd className="font-medium">{booking.booking_reference}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Transaction reference</dt>
              <dd className="font-medium">{activePayment.transaction_reference}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Amount submitted</dt>
              <dd className="font-medium">
                {Number(activePayment.amount_paid).toLocaleString()} {activePayment.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Submitted</dt>
              <dd className="font-medium">{new Date(activePayment.submitted_at).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Status</dt>
              <dd className="font-medium">{PAYMENT_STATUS_LABELS[activePayment.payment_status as "pending_verification"]}</dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }

  const activeChapaAttempt = await getActiveChapaAttemptForBooking(supabase, booking.id);
  if (activeChapaAttempt) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Payment Processing</h1>
            <ReleaseTimeButton bookingId={booking.id} bookingReference={booking.booking_reference} />
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            We&apos;re waiting for Chapa to confirm your payment.
          </p>
          {booking.hold_expires_at ? <HoldCountdown holdExpiresAt={booking.hold_expires_at} /> : null}
          <Link
            href={`/booking/${reference}/payment/chapa/return?tx_ref=${encodeURIComponent(activeChapaAttempt.provider_tx_ref ?? "")}`}
            className="mx-auto inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
          >
            Check Payment Status
          </Link>
        </div>
      </div>
    );
  }

  const allPayments = await getPaymentsForBooking(supabase, booking.id);
  const needsReview = allPayments.find((p) => p.payment_status === "requires_review");
  if (needsReview) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Payment Requires Review</h1>
          <FormMessage variant="error">
            Chapa confirmed a payment for this booking, but we couldn&apos;t automatically confirm
            your reservation. Your payment has not been lost -- our team is reviewing it manually.
            Please contact support and reference booking <strong>{booking.booking_reference}</strong>{" "}
            rather than attempting to pay again.
          </FormMessage>
        </div>
      </div>
    );
  }

  const latestPayment = await getLatestPaymentForBooking(supabase, booking.id);
  const rejected = latestPayment?.payment_status === "rejected" ? latestPayment : null;
  const failedChapaAttempt = latestPayment?.payment_method === "chapa" && latestPayment.payment_status === "failed";
  const chapaAvailable = isChapaConfigured();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-6">
        {failedChapaAttempt ? (
          <FormMessage variant="error">
            Your Chapa payment didn&apos;t go through. You can try Chapa again or use manual bank
            transfer below.
          </FormMessage>
        ) : null}

        {chapaAvailable ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Pay with Chapa</h1>
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">
              Pay securely online -- your booking confirms automatically once Chapa verifies your
              payment.
            </p>
            <dl className="mb-4 flex flex-col gap-2 rounded-md bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Amount</dt>
                <dd className="font-medium">
                  {Number(booking.base_price).toLocaleString()} {booking.currency}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
                <dd className="font-medium">{booking.booking_reference}</dd>
              </div>
            </dl>
            <ChapaPayButton bookingReference={booking.booking_reference} />
          </div>
        ) : null}

        {chapaAvailable ? (
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            Or
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>
        ) : null}

        {rejected ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Payment Needs Attention</h2>
            <p className="text-sm text-[var(--color-text-muted)]">Admin reason:</p>
            <p className="text-sm text-[var(--color-text)]">{rejected.rejection_reason}</p>
            {booking.hold_expires_at ? <HoldCountdown holdExpiresAt={booking.hold_expires_at} /> : null}
            <div>
              <ReleaseTimeButton bookingId={booking.id} bookingReference={booking.booking_reference} />
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <ReleaseTimeButton bookingId={booking.id} bookingReference={booking.booking_reference} />
          </div>
        )}

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h1 className="mb-1 text-xl font-semibold text-[var(--color-text)]">Manual Bank Transfer</h1>
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">
            Transfer the amount using the bank details below, then submit your transaction reference
            for verification.
          </p>

          <dl className="flex flex-col gap-2 rounded-md bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Bank</dt>
              <dd className="font-medium">{bank.bankName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Account name</dt>
              <dd className="font-medium">{bank.accountName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Account number</dt>
              <dd className="font-medium">{bank.accountNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Session base price</dt>
              <dd className="font-medium">
                {Number(booking.base_price).toLocaleString()} {booking.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
              <dd className="font-medium">{booking.booking_reference}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{bank.instructions}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Applicable government taxes will be calculated separately.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
            {rejected ? "Submit New Payment Details" : "Payment Details"}
          </h2>
          <ManualPaymentForm bookingReference={booking.booking_reference} />
        </div>

        <FormMessage variant="success">
          This is a development preview. No automatic bank verification occurs -- an admin reviews
          every submission manually.
        </FormMessage>
      </div>
    </div>
  );
}
