import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Booking, BookingIntake, BookableSlot, BookingStatus, SessionFormat } from "@/types/booking";
import { BOOKING_STATUS_LABELS } from "@/types/booking";
import type { Payment, PaymentStatus } from "@/types/payment";

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
 *
 * Takes only the two fields it needs (not a full Booking) so it can also
 * be applied to a narrower admin-list projection -- see
 * effectiveBookingStatus() below, the single reusable place any
 * BookingStatus-shaped view (as opposed to the customer-facing, payment-
 * aware DerivedSessionState in types/session.ts) corrects for this.
 */
export function isHoldExpired(booking: Pick<Booking, "booking_status" | "hold_expires_at">): boolean {
  return (
    (booking.booking_status === "held" || booking.booking_status === "awaiting_payment") &&
    booking.hold_expires_at !== null &&
    new Date(booking.hold_expires_at).getTime() <= Date.now()
  );
}

/**
 * The BookingStatus a booking should be treated as everywhere that isn't
 * already going through DerivedSessionState (types/session.ts, which is
 * customer-facing and payment-status-aware) -- reuses isHoldExpired
 * rather than re-deriving expiry, so there is exactly one definition of
 * "expired" in the codebase. A held/awaiting_payment row whose
 * hold_expires_at has already passed is effectively 'expired' even
 * though the raw column hasn't been lazily flipped yet; every other
 * status (confirmed/completed/cancelled/expired itself) passes through
 * unchanged.
 */
export function effectiveBookingStatus(booking: Pick<Booking, "booking_status" | "hold_expires_at">): BookingStatus {
  if (isHoldExpired(booking)) return "expired";
  return booking.booking_status as BookingStatus;
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

// =========================================================================
// Admin booking visibility (Phase 7 spec sections 39-43) -- minimal support
// read path, kept separate from admin's existing /admin/payments queue
// (lib/payment/data.ts) which this deliberately does not rebuild or merge
// with. Every read here relies on bookings_select_admin / booking_intake_
// select_admin (is_admin(), 033) -- an admin can already read every
// booking directly, so unlike the customer/expert data layers there is no
// narrow SECURITY DEFINER projection to route through here.
// =========================================================================

export type AdminBookingTab = "all" | BookingStatus;

export const ADMIN_BOOKING_TABS: { tab: AdminBookingTab; label: string }[] = [
  { tab: "all", label: "All" },
  { tab: "held", label: BOOKING_STATUS_LABELS.held },
  { tab: "awaiting_payment", label: BOOKING_STATUS_LABELS.awaiting_payment },
  { tab: "confirmed", label: BOOKING_STATUS_LABELS.confirmed },
  { tab: "completed", label: BOOKING_STATUS_LABELS.completed },
  { tab: "cancelled", label: BOOKING_STATUS_LABELS.cancelled },
  { tab: "expired", label: BOOKING_STATUS_LABELS.expired },
];

export type AdminBookingListRow = {
  id: string;
  bookingReference: string;
  customerName: string;
  expertName: string;
  startAt: string;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  bookingStatus: BookingStatus;
  latestPaymentStatus: PaymentStatus | null;
};

const ADMIN_BOOKINGS_PAGE_LIMIT = 50;

/**
 * A raw booking_status tab can also be reached by a row whose EFFECTIVE
 * status (effectiveBookingStatus() above) differs from its raw column --
 * only 'held'/'awaiting_payment' rows can become effectively 'expired'
 * (spec section 33: no cron), so those are exactly the raw statuses that
 * must be fetched, then re-classified in JS, when the requested tab is
 * one of 'held', 'awaiting_payment', or 'expired'. Every other tab
 * (confirmed/completed/cancelled) is unaffected and queried as-is.
 */
function rawStatusesToFetchForTab(tab: AdminBookingTab): BookingStatus[] | null {
  switch (tab) {
    case "all":
      return null; // no filter
    case "held":
    case "awaiting_payment":
      return [tab];
    case "expired":
      return ["expired", "held", "awaiting_payment"];
    default:
      return [tab];
  }
}

/**
 * Admin booking list (spec section 39) -- one status tab at a time, plus a
 * plain booking-reference search (spec: "search at minimum by booking
 * reference"), same "no fake counts, no complex filtering" posture as the
 * existing admin expert/payment queues. Nested embeds are hinted with
 * their constraint names for the same reason as getAdminPaymentList:
 * bookings carries more than one foreign key into profiles.
 *
 * Tabs/display use effectiveBookingStatus(), not the raw column, so an
 * expired-but-not-yet-flipped held/awaiting_payment reservation shows up
 * under "Expired" everywhere here, never lingering under "Held" /
 * "Awaiting Payment" -- the same correction the customer/expert
 * dashboards already apply via DerivedSessionState, reusing the one
 * shared isHoldExpired() check rather than a second implementation.
 *
 * Because the effective-status tabs (held/awaiting_payment/expired) are
 * filtered in JS after a broadened raw-status fetch, a tab can return
 * fewer than ADMIN_BOOKINGS_PAGE_LIMIT rows even if more exist beyond
 * that fetch's page -- an accepted limitation of this "no fake counts,
 * no complex filtering" support view, not a correctness issue (the
 * fetch is ordered newest-first, so the most relevant rows are the ones
 * on this page).
 */
export async function getAdminBookingList(
  supabase: TypedClient,
  tab: AdminBookingTab,
  search?: string,
): Promise<AdminBookingListRow[]> {
  let query = supabase
    .from("bookings")
    .select(
      `id, booking_reference, start_at, duration_minutes, session_format, booking_status, hold_expires_at,
       profiles!bookings_customer_id_fkey(full_name),
       expert_profiles!bookings_expert_profile_id_fkey(profiles!expert_profiles_user_id_fkey(full_name))`,
    )
    .order("created_at", { ascending: false })
    .limit(ADMIN_BOOKINGS_PAGE_LIMIT);

  const rawStatuses = rawStatusesToFetchForTab(tab);
  if (rawStatuses) query = query.in("booking_status", rawStatuses);

  const term = search?.trim();
  if (term) query = query.ilike("booking_reference", `%${term}%`);

  const { data, error } = await query;
  if (error) {
    console.error("getAdminBookingList: failed to load bookings", error);
    return [];
  }

  const rows = data ?? [];
  const bookingIds = rows.map((row) => row.id);

  const latestPaymentStatusByBooking = new Map<string, PaymentStatus>();
  if (bookingIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("booking_id, payment_status, submitted_at")
      .in("booking_id", bookingIds)
      .order("submitted_at", { ascending: false });

    for (const payment of payments ?? []) {
      if (!latestPaymentStatusByBooking.has(payment.booking_id)) {
        latestPaymentStatusByBooking.set(payment.booking_id, payment.payment_status as PaymentStatus);
      }
    }
  }

  return rows
    .map((row) => {
      const customer = row.profiles as unknown as { full_name: string } | null;
      const expertProfile = row.expert_profiles as unknown as { profiles: { full_name: string } | null } | null;

      return {
        id: row.id,
        bookingReference: row.booking_reference,
        customerName: customer?.full_name ?? "Unknown",
        expertName: expertProfile?.profiles?.full_name ?? "Unknown",
        startAt: row.start_at,
        durationMinutes: row.duration_minutes,
        sessionFormat: row.session_format as SessionFormat,
        bookingStatus: effectiveBookingStatus(row),
        latestPaymentStatus: latestPaymentStatusByBooking.get(row.id) ?? null,
      };
    })
    .filter((row) => tab === "all" || row.bookingStatus === tab);
}

export type AdminBookingDetail = {
  booking: Booking;
  intake: BookingIntake | null;
  customerName: string;
  expertName: string;
  expertSlug: string | null;
  payments: Payment[];
};

/** Admin booking detail (spec section 39) -- booking + intake + payment
 * status, with a link back into the existing /admin/payments detail page
 * rather than duplicating payment review UI here (spec: "keep the two
 * systems connected via navigation, not merged"). */
export async function getAdminBookingDetail(
  supabase: TypedClient,
  reference: string,
): Promise<AdminBookingDetail | null> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_reference", reference)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: intake }, { data: customer }, { data: expertProfile }, { data: payments }] = await Promise.all([
    supabase.from("booking_intake").select("*").eq("booking_id", booking.id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", booking.customer_id).maybeSingle(),
    supabase
      .from("expert_profiles")
      .select("slug, profiles!expert_profiles_user_id_fkey(full_name)")
      .eq("id", booking.expert_profile_id)
      .maybeSingle(),
    supabase.from("payments").select("*").eq("booking_id", booking.id).order("submitted_at", { ascending: false }),
  ]);

  const expertProfileTyped = expertProfile as unknown as {
    slug: string;
    profiles: { full_name: string } | null;
  } | null;

  return {
    booking,
    intake: intake ?? null,
    customerName: customer?.full_name ?? "Unknown",
    expertName: expertProfileTyped?.profiles?.full_name ?? "Unknown",
    expertSlug: expertProfileTyped?.slug ?? null,
    payments: payments ?? [],
  };
}
