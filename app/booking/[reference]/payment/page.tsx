import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookingByReference, isHoldExpired } from "@/lib/booking/data";
import { FormMessage } from "@/components/ui/FormMessage";

/**
 * "Ready for Payment" placeholder (spec section 55) -- Phase 5 ends here.
 * No payment provider, no confirmation. Deliberately never says "Booking
 * Confirmed" (spec section 56) -- only "Time Reserved" / "Ready for
 * Payment" language, since booking_status can never reach 'confirmed'
 * from any Phase 5 code path.
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
  if (!booking) notFound();

  if (isHoldExpired(booking)) redirect(`/booking/${reference}`);

  if (booking.booking_status !== "awaiting_payment") {
    redirect(`/booking/${reference}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Ready for Payment</h1>
        <p className="text-sm text-[var(--color-text)]">
          Your time is reserved and ready for payment. Payment methods will be connected in the
          next phase.
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Booking reference: {booking.booking_reference}
        </p>
        <FormMessage variant="success">
          This is a development preview. No payment has been processed and this booking is not yet
          confirmed.
        </FormMessage>
      </div>
    </div>
  );
}
