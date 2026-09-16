import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Booking, BookingIntake, BookingStatus, SessionFormat } from "@/types/booking";
import type { Payment, PaymentStatus } from "@/types/payment";
import { deriveSessionState, sessionTabForState, type DerivedSessionState, type SessionTab } from "@/types/session";
import { getBookingByReference, getBookingIntake, getExpertSlugForBooking, isHoldExpired } from "@/lib/booking/data";
import { getPaymentsForBooking, getLatestPaymentForBooking } from "@/lib/payment/data";
import { getPublicExpertProfile } from "@/lib/public/data";

type TypedClient = SupabaseClient<Database>;

/** Server-side auth guard for every /dashboard/* page. proxy.ts already
 * requires a session for this whole prefix; this is defense-in-depth plus
 * the userId every dashboard query needs. Unlike requireApprovedExpertPage
 * there is no status gate -- being logged in as a customer is the only
 * requirement (spec section 4: these routes already exist / are the
 * baseline, not gated behind any approval step). */
export async function requireCustomerPage(
  supabase: TypedClient,
  currentPath: string,
): Promise<{ userId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(currentPath)}`);
  return { userId: user.id };
}

export type CustomerSessionSummary = {
  bookingId: string;
  bookingReference: string;
  expertName: string;
  expertSlug: string | null;
  expertPhotoUrl: string | null;
  startAt: string;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  customerTimezone: string | null;
  bookingStatus: BookingStatus;
  derivedState: DerivedSessionState;
};

/**
 * hold_expires_at can be past its moment while booking_status still reads
 * 'held'/'awaiting_payment' (spec section 33: no cron, only the next real
 * mutation flips it) -- every dashboard view treats that the same as an
 * already-flipped 'expired' row, matching the effective-state check the
 * Phase 5 booking journey already applies (isHoldExpired in
 * lib/booking/data.ts) rather than re-deriving raw status from a display
 * layer.
 */
function effectiveDerivedState(booking: Booking, latestPaymentStatus: PaymentStatus | null): DerivedSessionState {
  if (isHoldExpired(booking)) return "expired";
  return deriveSessionState(booking.booking_status as BookingStatus, latestPaymentStatus);
}

/**
 * Resolves display info (name/slug/photo) for the distinct experts behind
 * a set of bookings -- one get_expert_slug_for_booking + one
 * get_expert_profile_public call per UNIQUE expert, never per booking
 * (spec section 68: don't over-fetch). Raw expert_profiles rows are never
 * selected directly here: RLS only grants that table to the owning expert
 * or an admin (010/013), so a customer's only legitimate path to an
 * expert's name is the same public-profile RPC pair the Phase 5 booking
 * journey already uses.
 */
async function getExpertDisplayMapForBookings(
  supabase: TypedClient,
  bookings: Booking[],
): Promise<Map<string, { slug: string; fullName: string; photoUrl: string | null }>> {
  const oneBookingIdPerExpert = new Map<string, string>();
  for (const booking of bookings) {
    if (!oneBookingIdPerExpert.has(booking.expert_profile_id)) {
      oneBookingIdPerExpert.set(booking.expert_profile_id, booking.id);
    }
  }

  const entries = await Promise.all(
    Array.from(oneBookingIdPerExpert.entries()).map(async ([expertProfileId, bookingId]) => {
      const slug = await getExpertSlugForBooking(supabase, bookingId);
      if (!slug) return null;
      const profile = await getPublicExpertProfile(supabase, slug);
      if (!profile) return null;
      return [expertProfileId, { slug, fullName: profile.fullName, photoUrl: profile.photoUrl }] as const;
    }),
  );

  return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}

function toSessionSummary(
  booking: Booking,
  expertMap: Map<string, { slug: string; fullName: string; photoUrl: string | null }>,
  latestPaymentStatus: PaymentStatus | null,
): CustomerSessionSummary {
  const expert = expertMap.get(booking.expert_profile_id);
  return {
    bookingId: booking.id,
    bookingReference: booking.booking_reference,
    expertName: expert?.fullName ?? "Unknown expert",
    expertSlug: expert?.slug ?? null,
    expertPhotoUrl: expert?.photoUrl ?? null,
    startAt: booking.start_at,
    durationMinutes: booking.duration_minutes,
    sessionFormat: booking.session_format as SessionFormat,
    customerTimezone: booking.customer_timezone,
    bookingStatus: booking.booking_status as BookingStatus,
    derivedState: effectiveDerivedState(booking, latestPaymentStatus),
  };
}

const SESSIONS_PAGE_LIMIT = 30;

/** Every booking the caller owns (bookings_select_own, 033), bounded to one
 * page (spec section 68: list pages paginate/limit). Latest payment status
 * is fetched in one batched query for just the awaiting_payment rows,
 * never one query per booking. */
async function getOwnBookingsWithLatestPayments(supabase: TypedClient): Promise<{
  bookings: Booking[];
  latestPaymentStatusByBooking: Map<string, PaymentStatus>;
}> {
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .order("start_at", { ascending: false })
    .limit(SESSIONS_PAGE_LIMIT);

  const bookings = data ?? [];
  const awaitingIds = bookings.filter((b) => b.booking_status === "awaiting_payment").map((b) => b.id);

  const latestPaymentStatusByBooking = new Map<string, PaymentStatus>();
  if (awaitingIds.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("booking_id, payment_status, submitted_at")
      .in("booking_id", awaitingIds)
      .order("submitted_at", { ascending: false });

    for (const payment of payments ?? []) {
      if (!latestPaymentStatusByBooking.has(payment.booking_id)) {
        latestPaymentStatusByBooking.set(payment.booking_id, payment.payment_status as PaymentStatus);
      }
    }
  }

  return { bookings, latestPaymentStatusByBooking };
}

/** My Sessions (spec section 6) -- Upcoming/Pending/Past, derived purely
 * from DerivedSessionState, never the raw booking_status column. */
export async function getCustomerSessions(supabase: TypedClient, tab: SessionTab): Promise<CustomerSessionSummary[]> {
  const { bookings, latestPaymentStatusByBooking } = await getOwnBookingsWithLatestPayments(supabase);
  const expertMap = await getExpertDisplayMapForBookings(supabase, bookings);

  const summaries = bookings
    .map((booking) => toSessionSummary(booking, expertMap, latestPaymentStatusByBooking.get(booking.id) ?? null))
    .filter((summary) => sessionTabForState(summary.derivedState) === tab);

  if (tab === "past") return summaries; // already newest-first
  return summaries.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export type DashboardOverview = {
  nextConfirmedSession: CustomerSessionSummary | null;
  actionablePendingSession: CustomerSessionSummary | null;
};

const PENDING_CANDIDATE_LIMIT = 5;

/** Dashboard overview (spec sections 6-8) -- prioritizes the next
 * confirmed session plus the single most relevant actionable pending
 * booking. Fetches only what's needed for those two cards, never the
 * customer's full booking history (spec section 68). */
export async function getDashboardOverview(supabase: TypedClient): Promise<DashboardOverview> {
  const nowIso = new Date().toISOString();

  const [{ data: nextConfirmed }, { data: pendingCandidates }] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("booking_status", "confirmed")
      .gt("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select("*")
      .in("booking_status", ["held", "awaiting_payment"])
      .order("created_at", { ascending: false })
      .limit(PENDING_CANDIDATE_LIMIT),
  ]);

  const actionablePending = (pendingCandidates ?? []).find((booking) => !isHoldExpired(booking)) ?? null;

  const relevantBookings = [nextConfirmed, actionablePending].filter((b): b is Booking => b !== null);
  const expertMap = await getExpertDisplayMapForBookings(supabase, relevantBookings);

  let pendingLatestPaymentStatus: PaymentStatus | null = null;
  if (actionablePending && actionablePending.booking_status === "awaiting_payment") {
    const latest = await getLatestPaymentForBooking(supabase, actionablePending.id);
    pendingLatestPaymentStatus = (latest?.payment_status as PaymentStatus) ?? null;
  }

  return {
    nextConfirmedSession: nextConfirmed ? toSessionSummary(nextConfirmed, expertMap, null) : null,
    actionablePendingSession: actionablePending
      ? toSessionSummary(actionablePending, expertMap, pendingLatestPaymentStatus)
      : null,
  };
}

export type CustomerSessionDetail = {
  booking: Booking;
  intake: BookingIntake | null;
  expertName: string;
  expertSlug: string | null;
  expertPhotoUrl: string | null;
  payments: Payment[];
  derivedState: DerivedSessionState;
};

/** Session detail (spec sections 12-14) -- ownership enforced entirely by
 * bookings_select_own RLS: a reference belonging to another customer, or
 * one that doesn't exist, both resolve to null here, so the caller can
 * notFound() either way without distinguishing them (spec section 52). */
export async function getCustomerSessionDetail(
  supabase: TypedClient,
  reference: string,
): Promise<CustomerSessionDetail | null> {
  const booking = await getBookingByReference(supabase, reference);
  if (!booking) return null;

  const [intake, payments, expertSlug] = await Promise.all([
    getBookingIntake(supabase, booking.id),
    getPaymentsForBooking(supabase, booking.id),
    getExpertSlugForBooking(supabase, booking.id),
  ]);

  const expertProfile = expertSlug ? await getPublicExpertProfile(supabase, expertSlug) : null;
  const latestPaymentStatus = (payments[0]?.payment_status as PaymentStatus | undefined) ?? null;

  return {
    booking,
    intake,
    expertName: expertProfile?.fullName ?? "Unknown expert",
    expertSlug,
    expertPhotoUrl: expertProfile?.photoUrl ?? null,
    payments,
    derivedState: effectiveDerivedState(booking, latestPaymentStatus),
  };
}

export type CustomerPaymentHistoryRow = {
  payment: Payment;
  bookingReference: string;
  expertName: string;
};

const PAYMENT_HISTORY_LIMIT = 50;

/** Payment history (spec section 15) -- reads the generic `payments` table
 * directly (payments_select_own, 037) so this needs no change when a
 * future Chapa payment_method starts appearing in the same rows. */
export async function getCustomerPaymentHistory(supabase: TypedClient): Promise<CustomerPaymentHistoryRow[]> {
  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(PAYMENT_HISTORY_LIMIT);

  const rows = payments ?? [];
  if (rows.length === 0) return [];

  const bookingIds = Array.from(new Set(rows.map((p) => p.booking_id)));
  const { data: bookings } = await supabase.from("bookings").select("*").in("id", bookingIds);
  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));

  const expertMap = await getExpertDisplayMapForBookings(supabase, Array.from(bookingById.values()));

  return rows.map((payment) => {
    const booking = bookingById.get(payment.booking_id);
    const expert = booking ? expertMap.get(booking.expert_profile_id) : undefined;
    return {
      payment,
      bookingReference: booking?.booking_reference ?? "—",
      expertName: expert?.fullName ?? "Unknown expert",
    };
  });
}
