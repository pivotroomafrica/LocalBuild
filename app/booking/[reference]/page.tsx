import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBookingByReference, getExpertSlugForBooking } from "@/lib/booking/data";

/**
 * Phase 12 (critical architecture change): the standalone booking journey
 * page is retired -- HOLD/INTAKE/REVIEW now render inline in BookingRail
 * on the expert profile. An old bookmarked /booking/[reference] link
 * must not 404 (spec: "old bookmarked booking URLs must not blindly
 * 404") -- it redirects to that booking's expert profile with
 * `?booking=<reference>` restored, and BookingRail re-derives the exact
 * right state from the booking's own current server data, same as it
 * would after any other refresh.
 *
 * Ownership is checked explicitly (booking.customer_id === user.id) same
 * as the retired page used to -- a reference belonging to someone else,
 * or one that doesn't exist, resolves to the plain marketplace here
 * rather than confirming or denying anything about it.
 */
export default async function BookingReferencePageRedirect({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/booking/${reference}`)}`);

  const booking = await getBookingByReference(supabase, reference);
  const expertSlug =
    booking && booking.customer_id === user.id ? await getExpertSlugForBooking(supabase, booking.id) : null;
  redirect(expertSlug ? `/experts/${expertSlug}?booking=${encodeURIComponent(reference)}` : "/experts");
}
