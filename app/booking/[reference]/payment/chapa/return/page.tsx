import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookingByReference } from "@/lib/booking/data";
import { getPaymentByProviderTxRef } from "@/lib/payment/data";
import { verifyAndFinalizeChapaTransaction } from "@/lib/chapa/verify";
import { FormMessage } from "@/components/ui/FormMessage";

/**
 * Chapa return route (spec section 16) -- where Chapa redirects the
 * customer's browser back to after checkout. Returning here NEVER means
 * success by itself (spec sections 17, 55): this page always calls
 * verifyAndFinalizeChapaTransaction(), which independently calls Chapa's
 * own Verify Transaction API and only then finalizes via
 * finalize_chapa_payment() (042) -- the same function the webhook route
 * calls, so whichever of the two "wins the race" first, the other safely
 * converges on the same already-finalized result (spec sections 35, 70).
 *
 * Ownership + tx_ref-to-booking binding are both checked before anything
 * is verified: the booking must belong to the signed-in customer, and
 * the tx_ref's own payment row (looked up through the CUSTOMER's own RLS-
 * scoped client, never a service-role client) must belong to that exact
 * booking -- a tx_ref for a different booking/customer 404s here exactly
 * like a nonexistent one (spec section 56).
 *
 * A refresh of this page re-verifies rather than creating a new attempt
 * (spec section 36) -- there is no mutation here that creates anything;
 * verifyAndFinalizeChapaTransaction is idempotent by construction.
 */
export default async function ChapaReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ tx_ref?: string }>;
}) {
  const { reference } = await params;
  const { tx_ref: txRef } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/booking/${reference}/payment/chapa/return?tx_ref=${txRef ?? ""}`)}`);

  const booking = await getBookingByReference(supabase, reference);
  if (!booking || booking.customer_id !== user.id) notFound();

  if (!txRef) notFound();
  const payment = await getPaymentByProviderTxRef(supabase, txRef);
  if (!payment || payment.booking_id !== booking.id) notFound();

  const outcome = await verifyAndFinalizeChapaTransaction(txRef);

  if (outcome.finalPaymentStatus === "verified") {
    redirect(`/booking/${reference}/payment`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        {outcome.finalPaymentStatus === "failed" ? (
          <>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Payment Failed</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Chapa reported that this payment did not go through. No charge was confirmed.
            </p>
          </>
        ) : outcome.finalPaymentStatus === "requires_review" ? (
          <>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Payment Requires Review</h1>
            <FormMessage variant="error">
              Chapa confirmed this payment, but we couldn&apos;t safely confirm your reservation (it
              may have expired). Your payment has not been lost -- our team will review it. Please
              contact support with your booking reference: <strong>{booking.booking_reference}</strong>.
            </FormMessage>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Checking Your Payment...</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              We&apos;re confirming your payment with Chapa. This can take a moment -- if this page
              hasn&apos;t updated, try checking again.
            </p>
            <Link
              href={`/booking/${reference}/payment/chapa/return?tx_ref=${encodeURIComponent(txRef)}`}
              className="mx-auto inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
            >
              Check Again
            </Link>
          </>
        )}

        <Link
          href={`/booking/${reference}/payment`}
          className="mx-auto text-sm font-medium text-[var(--color-brand)] hover:underline"
        >
          Back to payment options
        </Link>
      </div>
    </div>
  );
}
