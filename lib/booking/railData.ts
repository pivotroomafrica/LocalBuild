import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getBookingByReference,
  getBookingIntake,
  isCustomerProfileCompleteForBooking,
  isHoldExpired,
} from "@/lib/booking/data";
import {
  getActivePaymentForBooking,
  getActiveChapaAttemptForBooking,
  getPaymentsForBooking,
  getLatestPaymentForBooking,
} from "@/lib/payment/data";
import { getBankConfig, type BankConfig } from "@/lib/payment/bankConfig";
import { isChapaConfigured } from "@/lib/chapa/config";
import type { Booking, BookingIntake } from "@/types/booking";
import type { Payment } from "@/types/payment";
import type { CustomerProfile, Industry } from "@/types/profile";

type TypedClient = SupabaseClient<Database>;

/**
 * Phase 12 (inline booking rail) -- one server-side read that resolves
 * everything the rail's stage derivation needs for an existing booking,
 * so app/(public)/experts/[slug]/page.tsx has a single call rather than
 * re-implementing the branching that used to be spread across
 * /booking/[reference]/page.tsx and /booking/[reference]/payment/page.tsx.
 *
 * Ownership is re-checked explicitly (booking.customer_id === userId) on
 * top of RLS, same posture as those two pages -- but here a mismatch
 * returns null rather than notFound()/404ing the whole page: a booking
 * reference in the URL that doesn't belong to the signed-in customer must
 * never eject them from a public profile they're allowed to browse, and
 * must never confirm or deny that the reference exists (spec: "Customer A
 * cannot recover Customer B's booking via manipulated state"). The rail
 * simply falls back to a fresh SESSION state as if no `?booking=` were
 * present at all.
 */
export type RailBookingSnapshot = {
  booking: Booking;
  intake: BookingIntake | null;
  profileComplete: boolean;
  customerProfile: CustomerProfile | null;
  industries: Industry[];
  activeManualPayment: Payment | null;
  activeChapaAttempt: Payment | null;
  latestPayment: Payment | null;
  needsReview: boolean;
  chapaAvailable: boolean;
  bankConfig: BankConfig;
  holdExpired: boolean;
};

export async function getRailBookingSnapshot(
  supabase: TypedClient,
  reference: string,
  userId: string,
): Promise<RailBookingSnapshot | null> {
  const booking = await getBookingByReference(supabase, reference);
  if (!booking || booking.customer_id !== userId) return null;

  const [intake, profileComplete, { data: customerProfile }, { data: industries }] = await Promise.all([
    getBookingIntake(supabase, booking.id),
    isCustomerProfileCompleteForBooking(supabase, userId),
    supabase.from("customer_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("industries").select("*").eq("is_active", true).order("name"),
  ]);

  let activeManualPayment: Payment | null = null;
  let activeChapaAttempt: Payment | null = null;
  let latestPayment: Payment | null = null;
  let needsReview = false;

  // Payment history is only ever relevant once the booking has actually
  // reached (or passed through) awaiting_payment -- fetching it for a
  // still-held booking would just be three wasted round trips every time
  // this snapshot is read.
  if (booking.booking_status === "awaiting_payment" || booking.booking_status === "confirmed") {
    const [manual, chapa, latest, all] = await Promise.all([
      getActivePaymentForBooking(supabase, booking.id),
      getActiveChapaAttemptForBooking(supabase, booking.id),
      getLatestPaymentForBooking(supabase, booking.id),
      getPaymentsForBooking(supabase, booking.id),
    ]);
    activeManualPayment = manual;
    activeChapaAttempt = chapa;
    latestPayment = latest;
    needsReview = all.some((p) => p.payment_status === "requires_review");
  }

  return {
    booking,
    intake,
    profileComplete,
    customerProfile: customerProfile ?? null,
    industries: industries ?? [],
    activeManualPayment,
    activeChapaAttempt,
    latestPayment,
    needsReview,
    chapaAvailable: isChapaConfigured(),
    bankConfig: getBankConfig(),
    holdExpired: isHoldExpired(booking),
  };
}
