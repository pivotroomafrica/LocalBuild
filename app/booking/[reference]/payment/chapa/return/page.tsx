import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookingByReference, getExpertSlugForBooking } from "@/lib/booking/data";

/**
 * Phase 12 (critical architecture change): Chapa's own returnUrl is now
 * built pointing directly at the expert profile
 * (lib/payment/chapaActions.ts), so no NEW Chapa attempt ever lands here.
 * This route only still exists for an attempt that was initiated before
 * this change deployed, whose returnUrl was already baked in as this
 * path at initialization time -- it forwards tx_ref/chapa_return onward
 * to the profile route, which runs the exact same (idempotent,
 * independently re-verifying) Chapa-return handling this page used to.
 */
export default async function ChapaReturnPageRedirect({
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
  if (!user) {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/booking/${reference}/payment/chapa/return?tx_ref=${txRef ?? ""}`)}`,
    );
  }

  const booking = await getBookingByReference(supabase, reference);
  const expertSlug =
    booking && booking.customer_id === user.id ? await getExpertSlugForBooking(supabase, booking.id) : null;

  if (!expertSlug) redirect("/experts");

  const target = new URLSearchParams({ booking: reference, chapa_return: "1" });
  if (txRef) target.set("tx_ref", txRef);
  redirect(`/experts/${expertSlug}?${target.toString()}`);
}
