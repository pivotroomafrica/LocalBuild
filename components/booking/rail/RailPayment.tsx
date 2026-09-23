"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { ReleaseTimeButton } from "@/components/booking/ReleaseTimeButton";
import { ManualPaymentForm } from "@/components/payment/ManualPaymentForm";
import { ChapaPayButton } from "@/components/payment/ChapaPayButton";
import type { Booking } from "@/types/booking";
import type { Payment } from "@/types/payment";
import { PAYMENT_STATUS_LABELS } from "@/types/payment";
import type { BankConfig } from "@/lib/payment/bankConfig";

type Props = {
  booking: Booking;
  expertSlug: string;
  activeManualPayment: Payment | null;
  activeChapaAttempt: Payment | null;
  latestPayment: Payment | null;
  needsReview: boolean;
  chapaAvailable: boolean;
  bankConfig: BankConfig;
};

/**
 * PAYMENT + PAYMENT_STATUS (spec states 7-8), adapted from the retired
 * standalone /booking/[reference]/payment page -- same branching, same
 * reused ManualPaymentForm/submit_manual_payment and ChapaPayButton/
 * create_chapa_payment_attempt logic, just rendered in place. "Check
 * Again" for an in-flight Chapa attempt now calls router.refresh() on
 * this SAME expert-profile route instead of navigating to a standalone
 * check-status page -- the profile page's own Chapa-return handling
 * (app/(public)/experts/[slug]/page.tsx) already re-verifies on every
 * load via verifyAndFinalizeChapaTransaction, idempotently, so a refresh
 * here is exactly as safe as the old page's own reload.
 */
export function RailPayment({
  booking,
  expertSlug,
  activeManualPayment,
  activeChapaAttempt,
  latestPayment,
  needsReview,
  chapaAvailable,
  bankConfig,
}: Props) {
  const router = useRouter();

  if (needsReview) {
    return (
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">Payment requires review</h2>
        <FormMessage variant="error">
          Chapa confirmed a payment for this booking, but we couldn&apos;t automatically confirm your
          reservation. Your payment has not been lost -- our team is reviewing it manually. Please
          contact support and reference booking <strong>{booking.booking_reference}</strong> rather
          than attempting to pay again.
        </FormMessage>
      </section>
    );
  }

  if (activeManualPayment) {
    return (
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Payment submitted</h2>
          <ReleaseTimeButton bookingId={booking.id} bookingReference={booking.booking_reference} />
        </div>
        <p className="mb-3 text-sm text-[var(--color-text)]">Your transfer is waiting for verification.</p>
        <dl className="flex flex-col gap-2 rounded-[var(--radius-input)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
            <dd className="font-medium">{booking.booking_reference}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Transaction reference</dt>
            <dd className="font-medium">{activeManualPayment.transaction_reference}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Amount submitted</dt>
            <dd className="tabular-nums-brand font-medium">
              {Number(activeManualPayment.amount_paid).toLocaleString()} {activeManualPayment.currency}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Status</dt>
            <dd className="font-medium">
              {PAYMENT_STATUS_LABELS[activeManualPayment.payment_status as "pending_verification"]}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  if (activeChapaAttempt) {
    return (
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Payment processing</h2>
          <ReleaseTimeButton bookingId={booking.id} bookingReference={booking.booking_reference} />
        </div>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          We&apos;re waiting for Chapa to confirm your payment.
        </p>
        {booking.hold_expires_at ? <HoldCountdown holdExpiresAt={booking.hold_expires_at} /> : null}
        <Button type="button" className="mt-3" onClick={() => router.refresh()}>
          Check payment status
        </Button>
      </section>
    );
  }

  const rejected = latestPayment?.payment_status === "rejected" ? latestPayment : null;
  const failedChapaAttempt = latestPayment?.payment_method === "chapa" && latestPayment.payment_status === "failed";

  return (
    <section className="flex flex-col gap-4">
      {failedChapaAttempt ? (
        <FormMessage variant="error">
          Your Chapa payment didn&apos;t go through. You can try Chapa again or use manual bank
          transfer below.
        </FormMessage>
      ) : null}

      {chapaAvailable ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-1 text-lg font-semibold text-[var(--color-text)]">Pay with Chapa</h2>
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">
            Pay securely online -- your booking confirms automatically once Chapa verifies your
            payment.
          </p>
          <dl className="mb-3 flex flex-col gap-2 rounded-[var(--radius-input)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Amount</dt>
              <dd className="tabular-nums-brand font-medium">
                {Number(booking.base_price).toLocaleString()} {booking.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
              <dd className="font-medium">{booking.booking_reference}</dd>
            </div>
          </dl>
          <ChapaPayButton bookingReference={booking.booking_reference} expertSlug={expertSlug} />
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
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Payment needs attention</h2>
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

      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-1 text-lg font-semibold text-[var(--color-text)]">Manual bank transfer</h2>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Transfer the amount using the bank details below, then submit your transaction reference
          for verification.
        </p>

        <dl className="flex flex-col gap-2 rounded-[var(--radius-input)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Bank</dt>
            <dd className="font-medium">{bankConfig.bankName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Account name</dt>
            <dd className="font-medium">{bankConfig.accountName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Account number</dt>
            <dd className="font-medium">{bankConfig.accountNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Session base price</dt>
            <dd className="tabular-nums-brand font-medium">
              {Number(booking.base_price).toLocaleString()} {booking.currency}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
            <dd className="font-medium">{booking.booking_reference}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{bankConfig.instructions}</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Applicable government taxes will be calculated separately.
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
          {rejected ? "Submit new payment details" : "Payment details"}
        </h2>
        <ManualPaymentForm bookingReference={booking.booking_reference} />
      </div>

      <FormMessage variant="success">
        This is a development preview. No automatic bank verification occurs -- an admin reviews
        every submission manually.
      </FormMessage>
    </section>
  );
}
