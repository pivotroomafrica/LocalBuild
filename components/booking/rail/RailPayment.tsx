"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkChapaPaymentAction } from "@/lib/chapa/checkAction";
import { leaveChapaAttemptAction, type LeaveChapaState } from "@/lib/payment/chapaActions";
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
import { bookingChargeAmount } from "@/lib/pricing/platform";

type Props = {
  booking: Booking;
  expertSlug: string;
  activeManualPayment: Payment | null;
  activeChapaAttempt: Payment | null;
  latestPayment: Payment | null;
  needsReview: boolean;
  chapaAvailable: boolean;
  manualVerificationRequired: boolean;
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
  manualVerificationRequired,
  bankConfig,
}: Props) {
  if (needsReview) {
    return (
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-xl font-extrabold tracking-[-0.02em] text-[var(--color-text)]">Payment requires review</h2>
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
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-[var(--color-text)]">Payment submitted</h2>
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
    return <ChapaProcessing booking={booking} expertSlug={expertSlug} chapaAvailable={chapaAvailable} />;
  }

  const rejected = latestPayment?.payment_status === "rejected" ? latestPayment : null;
  const lastChapa = latestPayment?.payment_method === "chapa" && latestPayment.payment_status === "failed" ? latestPayment : null;
  // Left on purpose ("Pay by bank transfer instead") is not an error.
  const leftChapa = lastChapa?.provider_status === "abandoned_by_customer";
  const failedChapaAttempt = lastChapa !== null && !leftChapa;

  return (
    <section className="flex flex-col gap-4">
      {failedChapaAttempt ? (
        <PaymentFailedPanel booking={booking} expertSlug={expertSlug} chapaAvailable={chapaAvailable} />
      ) : null}

      {chapaAvailable && !failedChapaAttempt ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-1 text-xl font-extrabold tracking-[-0.02em] text-[var(--color-text)]">Pay with Chapa</h2>
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">
            Pay securely online -- your booking confirms automatically once Chapa verifies your
            payment.
          </p>
          <dl className="mb-3 flex flex-col gap-2 rounded-[var(--radius-input)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Amount (incl. VAT)</dt>
              <dd className="tabular-nums-brand font-medium">
                {bookingChargeAmount(booking).toLocaleString()} {booking.currency}
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

      {manualVerificationRequired ? (
        <FormMessage variant="success">
          Payments of this size are verified manually by our team. Please pay by bank transfer below.
        </FormMessage>
      ) : null}

      {chapaAvailable && !failedChapaAttempt ? (
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
          Or
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>
      ) : null}

      {rejected ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-[15px] font-extrabold tracking-[-0.01em] text-[var(--color-text)]">Payment needs attention</h2>
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

      <div
        id={`bank-${booking.booking_reference}`}
        tabIndex={-1}
        className="scroll-mt-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 outline-none"
      >
        <h2 className="mb-1 text-xl font-extrabold tracking-[-0.02em] text-[var(--color-text)]">Manual bank transfer</h2>
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Transfer the amount using the bank details below, then submit your transaction reference
          for verification.
        </p>

        <dl className="flex flex-col gap-2 rounded-[var(--radius-input)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Bank</dt>
            <dd className="font-medium">{bankConfig.bankName}</dd>
          </div>
          {bankConfig.accountName ? (
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Account name</dt>
              <dd className="font-medium">{bankConfig.accountName}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Account number</dt>
            <dd className="font-medium">{bankConfig.accountNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Amount to transfer (incl. VAT)</dt>
            <dd className="tabular-nums-brand font-medium">
              {bookingChargeAmount(booking).toLocaleString()} {booking.currency}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
            <dd className="font-medium">{booking.booking_reference}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{bankConfig.instructions}</p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-[15px] font-extrabold tracking-[-0.01em] text-[var(--color-text)]">
          {rejected ? "Submit new payment details" : "Payment details"}
        </h2>
        <ManualPaymentForm bookingReference={booking.booking_reference} />
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        Our team checks every bank transfer by hand and then confirms your booking.
      </p>
    </section>
  );
}

/** Shown when Chapa reported the last attempt as not paid: says so plainly
 * and puts both ways forward right under it. */
function PaymentFailedPanel({
  booking,
  expertSlug,
  chapaAvailable,
}: {
  booking: Booking;
  expertSlug: string;
  chapaAvailable: boolean;
}) {
  function goToBank() {
    const bank = document.getElementById(`bank-${booking.booking_reference}`);
    bank?.scrollIntoView({ behavior: "smooth", block: "start" });
    bank?.focus({ preventScroll: true });
  }

  return (
    <div className="payfail" role="alert">
      <div className="payfail-head">
        <span className="ms payfail-icon" aria-hidden="true">
          error
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="payfail-title">Your payment didn&apos;t go through</h2>
          <p className="payfail-text">
            Chapa didn&apos;t confirm this payment, so your booking isn&apos;t paid yet. Your time is still held for
            you: try again, or pay by bank transfer.
          </p>
        </div>
      </div>
      {booking.hold_expires_at ? <HoldCountdown holdExpiresAt={booking.hold_expires_at} /> : null}
      <div className="flex flex-col gap-2">
        {chapaAvailable ? (
          <ChapaPayButton bookingReference={booking.booking_reference} expertSlug={expertSlug} label="Try again with Chapa" />
        ) : null}
        <Button type="button" variant="secondary" onClick={goToBank}>
          Pay by bank transfer instead
        </Button>
      </div>
    </div>
  );
}

const leaveInitial: LeaveChapaState = {};

/** Asks Chapa about the payment every few seconds (for about two
 * minutes), and on demand, until it's confirmed or failed -- and, because
 * a checkout opened but not finished stays "not paid yet" at Chapa for
 * ever, always offers the way on: back to Chapa, or bank transfer. */
function ChapaProcessing({
  booking,
  expertSlug,
  chapaAvailable,
}: {
  booking: Booking;
  expertSlug: string;
  chapaAvailable: boolean;
}) {
  const router = useRouter();
  const [isChecking, startCheck] = useTransition();
  const [checks, setChecks] = useState(0);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [leaveState, leaveAction, leaving] = useActionState(leaveChapaAttemptAction, leaveInitial);
  const [intent, setIntent] = useState<"chapa" | "bank" | null>(null);

  function check() {
    startCheck(async () => {
      const { status } = await checkChapaPaymentAction(booking.booking_reference);
      setLastStatus(status);
      setChecks((n) => n + 1);
      if (status !== "initiated") router.refresh();
    });
  }

  useEffect(() => {
    if (checks >= 24) return;
    const timer = setTimeout(check, checks === 0 ? 1500 : 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only after each finished check
  }, [checks]);

  // Paid after all, or the attempt was closed: show the fresh state.
  useEffect(() => {
    if (leaveState.done) router.refresh();
  }, [leaveState.done, router]);

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-[var(--color-text)]">Waiting for Chapa</h2>
        <ReleaseTimeButton bookingId={booking.id} bookingReference={booking.booking_reference} />
      </div>
      <p className="mb-3 text-sm text-[var(--color-text-muted)]">
        If you paid on Chapa, this confirms by itself in a moment. If you didn&apos;t finish paying there, you can
        go back to Chapa or pay by bank transfer instead.
      </p>
      {booking.hold_expires_at ? <HoldCountdown holdExpiresAt={booking.hold_expires_at} /> : null}
      {checks >= 24 && lastStatus === "initiated" ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">Chapa hasn&apos;t confirmed a payment yet.</p>
      ) : null}
      {leaveState.error ? (
        <div className="mt-3">
          <FormMessage variant="error">{leaveState.error}</FormMessage>
        </div>
      ) : null}

      <form action={leaveAction} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="booking_reference" value={booking.booking_reference} />
        <input type="hidden" name="expert_slug" value={expertSlug} />
        {chapaAvailable ? (
          <Button
            type="submit"
            name="intent"
            value="chapa"
            onClick={() => setIntent("chapa")}
            isLoading={leaving && intent === "chapa"}
            loadingText="Opening Chapa..."
            disabled={leaving}
          >
            Continue to Chapa
          </Button>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="bank"
          variant="secondary"
          onClick={() => setIntent("bank")}
          isLoading={leaving && intent === "bank"}
          loadingText="One moment..."
          disabled={leaving}
        >
          Pay by bank transfer instead
        </Button>
      </form>
      <button
        type="button"
        className="mt-3 w-full text-center text-sm font-medium text-[var(--color-accent)] disabled:opacity-60"
        onClick={check}
        disabled={isChecking || leaving}
      >
        {isChecking ? "Checking with Chapa..." : "I've paid, check now"}
      </button>
    </section>
  );
}
