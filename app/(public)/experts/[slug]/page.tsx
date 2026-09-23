import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicExpertProfile } from "@/lib/public/data";
import { getRailBookingSnapshot } from "@/lib/booking/railData";
import { getBookingByReference, isCustomerProfileCompleteForBooking } from "@/lib/booking/data";
import { getPaymentByProviderTxRef } from "@/lib/payment/data";
import { verifyAndFinalizeChapaTransaction } from "@/lib/chapa/verify";
import { PublicProfileView } from "@/components/expert/PublicProfileView";
import { Container } from "@/components/ui/Container";
import type { CustomerProfile } from "@/types/profile";

/**
 * Phase 12 (critical architecture change): this route is now also where
 * the entire customer booking journey lives, via BookingRail in the
 * right-hand rail -- `?booking=<reference>` names an in-progress
 * reservation, and `?chapa_return=1&tx_ref=...` is where Chapa's checkout
 * redirects back to (the one allowed exception to "never navigate away
 * from the profile"). force-dynamic because both of those, plus the
 * signed-in customer's own booking-eligibility facts, are per-request and
 * per-customer -- the SAME discipline the old /book/[slug] page already
 * had for the identical reason, just centralized on this one route now.
 */
export const dynamic = "force-dynamic";

export default async function PublicExpertProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  // getPublicExpertProfile reads exclusively through
  // get_expert_profile_public() (filtered to profile_status = 'published'
  // at the database level) -- any other status resolves to null here,
  // identical to a slug that was never registered at all. notFound()
  // renders a bare 404 either way, so a draft/submitted/rejected/
  // unpublished application never reveals that it exists.
  const profile = await getPublicExpertProfile(supabase, slug);
  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const bookingReference = typeof sp.booking === "string" ? sp.booking : null;
  const chapaReturn = sp.chapa_return === "1";
  const txRef = typeof sp.tx_ref === "string" ? sp.tx_ref : null;

  // Chapa's own external checkout is the one allowed exception to "never
  // navigate away from the profile" -- but the return trip must still
  // independently re-verify via Chapa's own Verify API before anything is
  // finalized (spec: never trust the redirect itself). Ownership and the
  // tx_ref-to-booking binding are both checked first, same posture as the
  // retired standalone .../chapa/return page -- a tx_ref that doesn't
  // belong to this booking/customer is silently ignored rather than
  // finalizing anything, and verification is idempotent by construction
  // so a refresh of this same URL safely re-runs it.
  if (user && chapaReturn && txRef && bookingReference) {
    const booking = await getBookingByReference(supabase, bookingReference);
    if (booking && booking.customer_id === user.id) {
      const payment = await getPaymentByProviderTxRef(supabase, txRef);
      if (payment && payment.booking_id === booking.id) {
        await verifyAndFinalizeChapaTransaction(txRef);
      }
    }
  }

  const { data: industriesData } = await supabase.from("industries").select("*").eq("is_active", true).order("name");
  const industries = industriesData ?? [];

  let railSnapshot: Awaited<ReturnType<typeof getRailBookingSnapshot>> = null;
  let profileComplete = false;
  let customerProfile: CustomerProfile | null = null;

  if (user) {
    const [snapshot, complete, profileRow] = await Promise.all([
      bookingReference ? getRailBookingSnapshot(supabase, bookingReference, user.id) : Promise.resolve(null),
      isCustomerProfileCompleteForBooking(supabase, user.id),
      supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    railSnapshot = snapshot;
    profileComplete = complete;
    customerProfile = profileRow.data;
  }

  return (
    <Container className="py-10 pb-28 sm:py-16 lg:pb-16">
      <div className="mx-auto max-w-4xl">
        <PublicProfileView
          profile={profile}
          railAuth={{
            isLoggedIn: Boolean(user),
            profileComplete,
            customerProfile: customerProfile ?? null,
            industries: industries ?? [],
          }}
          railSnapshot={railSnapshot}
        />
      </div>
    </Container>
  );
}
