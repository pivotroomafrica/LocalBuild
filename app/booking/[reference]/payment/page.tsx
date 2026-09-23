import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookingByReference, getExpertSlugForBooking } from "@/lib/booking/data";

/**
 * Phase 12 (critical architecture change): the standalone payment page is
 * retired -- PAYMENT/PAYMENT_STATUS now render inline in BookingRail on
 * the expert profile (same route/redirect posture as
 * /booking/[reference]/page.tsx above it -- see that file's comment).
 */
export default async function BookingPaymentPageRedirect({
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
  const expertSlug =
    booking && booking.customer_id === user.id ? await getExpertSlugForBooking(supabase, booking.id) : null;
  redirect(expertSlug ? `/experts/${expertSlug}?booking=${encodeURIComponent(reference)}` : "/experts");
}
