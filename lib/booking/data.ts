import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Booking, BookingIntake, BookableSlot, SessionFormat } from "@/types/booking";

type TypedClient = SupabaseClient<Database>;

/**
 * The only public read path for bookable times (get_bookable_slots(),
 * 034_booking_functions.sql) -- derives Phase 4 availability minus active
 * bookings entirely server-side. Returns [] for any expert that isn't
 * published/approved, doesn't offer this duration/format, or has no
 * bookable time in the range -- same shape whether the expert doesn't
 * exist or genuinely has nothing open, so nothing about a non-published
 * slug leaks through this call either.
 *
 * Called with a bounded range (month-by-month, spec section 21) -- never
 * the full 90-day horizon in one call.
 */
export async function getBookableSlots(
  supabase: TypedClient,
  params: {
    expertSlug: string;
    durationMinutes: number;
    sessionFormat: SessionFormat;
    rangeStart: string; // "YYYY-MM-DD"
    rangeEnd: string; // "YYYY-MM-DD"
    customerTimezone?: string | null;
  },
): Promise<BookableSlot[]> {
  const { data, error } = await supabase.rpc("get_bookable_slots", {
    p_expert_slug: params.expertSlug,
    p_duration_minutes: params.durationMinutes,
    p_session_format: params.sessionFormat,
    p_range_start: params.rangeStart,
    p_range_end: params.rangeEnd,
    p_customer_timezone: params.customerTimezone ?? undefined,
  });

  if (error) {
    console.error("getBookableSlots: get_bookable_slots RPC failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    startAt: row.start_at!,
    endAt: row.end_at!,
    expertTimezone: row.expert_timezone!,
  }));
}

/**
 * Owner-scoped by RLS (bookings_select_own / bookings_select_admin, 033) --
 * a reference belonging to another customer resolves to null here, the
 * same as one that doesn't exist at all (spec section 60: not guessable
 * via reference/URL alone).
 */
export async function getBookingByReference(
  supabase: TypedClient,
  reference: string,
): Promise<Booking | null> {
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_reference", reference)
    .maybeSingle();
  return data;
}

export async function getBookingIntake(
  supabase: TypedClient,
  bookingId: string,
): Promise<BookingIntake | null> {
  const { data } = await supabase
    .from("booking_intake")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  return data;
}

/**
 * Resolves a booking the caller owns to its expert's public slug via
 * get_expert_slug_for_booking() (035) -- expert_profiles RLS only allows
 * the owner or an admin to select a row directly, so a customer with a
 * real booking has no other way to rebuild the "Choose Another Time" /
 * review-page link back to that expert's public profile.
 */
export async function getExpertSlugForBooking(
  supabase: TypedClient,
  bookingId: string,
): Promise<string | null> {
  const { data } = await supabase.rpc("get_expert_slug_for_booking", { p_booking_id: bookingId });
  return data ?? null;
}

/**
 * hold_expires_at is checked directly, not just booking_status -- there
 * is no cron (spec section 33), so a stale row can still read
 * booking_status = 'held'/'awaiting_payment' after its expiry moment has
 * already passed; the next real mutation (create_booking_hold or
 * advance_booking_to_awaiting_payment) is what actually flips it. A
 * plain helper (not inline in a page component) so the Date.now() read
 * isn't attributed to a component's render body.
 */
export function isHoldExpired(booking: Booking): boolean {
  return (
    (booking.booking_status === "held" || booking.booking_status === "awaiting_payment") &&
    booking.hold_expires_at !== null &&
    new Date(booking.hold_expires_at).getTime() <= Date.now()
  );
}

/**
 * Booking-specific completeness gate (spec section 48) -- reuses Phase 1's
 * own customer_profiles fields/types, newly REQUIRED here even though
 * they stay optional on the regular profile page
 * (advance_booking_to_awaiting_payment() in 034 enforces the same
 * condition server-side; this mirrors it for the UI so the journey can
 * show/skip the inline form without a wasted round trip).
 */
export async function isCustomerProfileCompleteForBooking(
  supabase: TypedClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("customer_profiles")
    .select("current_role, employment_type, industry_id, years_experience_range")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return false;
  return Boolean(
    data.current_role &&
      data.current_role.trim().length > 0 &&
      data.employment_type &&
      data.industry_id &&
      data.years_experience_range,
  );
}
