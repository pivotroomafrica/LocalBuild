import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Booking, BookingIntake, BookingStatus, SessionFormat } from "@/types/booking";

type TypedClient = SupabaseClient<Database>;

/** Booking statuses an expert may ever see -- nothing else, anywhere in
 * this module. */
const EXPERT_VISIBLE_STATUSES = ["confirmed", "completed"] as const;

/**
 * The narrow customer projection for one booking (spec sections 27-31) --
 * the ONLY path an expert has to any customer professional-profile data.
 * Backed by get_customer_context_for_booking() (039), which internally
 * re-derives the caller's own expert identity from auth.uid() and
 * re-validates booking ownership + confirmed/completed status before
 * returning anything, so this call is safe to make with only a booking
 * id -- there is no broader grant on customer_profiles/profiles for any
 * expert to accidentally rely on instead.
 */
export type CustomerContext = {
  fullName: string;
  currentRole: string | null;
  employmentType: string | null;
  companyName: string | null;
  industryName: string | null;
  yearsExperienceRange: string | null;
  linkedinUrl: string | null;
};

async function getCustomerContextForBooking(
  supabase: TypedClient,
  bookingId: string,
): Promise<CustomerContext | null> {
  const { data } = await supabase
    .rpc("get_customer_context_for_booking", { p_booking_id: bookingId })
    .maybeSingle();

  if (!data) return null;
  return {
    fullName: data.full_name ?? "Unknown",
    currentRole: data.current_role,
    employmentType: data.employment_type,
    companyName: data.company_name,
    industryName: data.industry_name,
    yearsExperienceRange: data.years_experience_range,
    linkedinUrl: data.linkedin_url,
  };
}

export type ExpertSessionSummary = {
  bookingId: string;
  bookingReference: string;
  customerName: string;
  startAt: string;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  expertTimezone: string;
  bookingStatus: BookingStatus;
};

function toExpertSessionSummary(booking: Booking, customerName: string): ExpertSessionSummary {
  return {
    bookingId: booking.id,
    bookingReference: booking.booking_reference,
    customerName,
    startAt: booking.start_at,
    durationMinutes: booking.duration_minutes,
    sessionFormat: booking.session_format as SessionFormat,
    expertTimezone: booking.expert_timezone,
    bookingStatus: booking.booking_status as BookingStatus,
  };
}

const EXPERT_SESSIONS_LIMIT = 50;

/**
 * Every session this expert can see at all (spec section 25).
 *
 * CRITICAL browser-test repair: this used to be a bare `select *` with no
 * filter, trusting bookings_select_own_expert (039) alone to scope the
 * result. That RLS policy IS correctly restricted to confirmed/completed
 * rows for the caller's own expert_profile_id -- but Postgres OR's every
 * applicable permissive SELECT policy together, and bookings_select_own
 * (033, no status filter at all) is ALSO permissive for the same caller
 * whenever they happen to be the CUSTOMER on some other booking (a real
 * scenario: one account can be both a customer and a published expert).
 * A bare select therefore returned that account's own held/
 * awaiting_payment/expired customer bookings mixed into what was supposed
 * to be an expert-only list -- exactly the "awaiting_payment booking
 * visible to the expert" bug reported. Fixed by filtering explicitly on
 * BOTH conditions here, in addition to (never instead of) RLS:
 * `expert_profile_id = expertProfileId` AND `booking_status IN
 * ('confirmed','completed')`.
 */
export async function getExpertSessions(
  supabase: TypedClient,
  expertProfileId: string,
): Promise<ExpertSessionSummary[]> {
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("expert_profile_id", expertProfileId)
    .in("booking_status", EXPERT_VISIBLE_STATUSES)
    .order("start_at", { ascending: false })
    .limit(EXPERT_SESSIONS_LIMIT);

  const rows = bookings ?? [];

  const nameEntries = await Promise.all(
    rows.map(async (booking) => {
      const context = await getCustomerContextForBooking(supabase, booking.id);
      return [booking.id, context?.fullName ?? "Unknown"] as const;
    }),
  );
  const nameByBooking = new Map(nameEntries);

  return rows.map((booking) => toExpertSessionSummary(booking, nameByBooking.get(booking.id) ?? "Unknown"));
}

/** Expert dashboard overview (spec sections 20-23) -- just the next
 * confirmed session, never the full session list (spec section 68: don't
 * over-fetch). Same explicit `expert_profile_id` filter as
 * getExpertSessions -- see that function's comment for why RLS alone is
 * not sufficient for a dual-identity account. */
export async function getExpertNextSession(
  supabase: TypedClient,
  expertProfileId: string,
): Promise<ExpertSessionSummary | null> {
  const nowIso = new Date().toISOString();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("expert_profile_id", expertProfileId)
    .eq("booking_status", "confirmed")
    .gt("start_at", nowIso)
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!booking) return null;

  const context = await getCustomerContextForBooking(supabase, booking.id);
  return toExpertSessionSummary(booking, context?.fullName ?? "Unknown");
}

export type ExpertSessionDetail = {
  booking: Booking;
  intake: BookingIntake | null;
  customer: CustomerContext | null;
};

/**
 * Session detail for the expert side (spec sections 24-31, 55).
 *
 * Ownership and status are now verified THREE ways, independently:
 * (1) RLS -- bookings_select_own_expert / booking_intake_select_expert
 *     (039) scope what a bare select can return at all.
 * (2) This function re-checks, in application code, that the fetched
 *     booking's `expert_profile_id` equals the caller's OWN
 *     `expertProfileId` (resolved server-side from `auth.uid()` by
 *     requireApprovedExpertPage, never trusted from the URL) AND that
 *     `booking_status` is confirmed/completed -- explicitly, not merely
 *     assumed from RLS having let the row through. Any mismatch returns
 *     null immediately, before the intake or customer context is ever
 *     fetched.
 * (3) get_customer_context_for_booking()'s own internal re-validation for
 *     the customer projection.
 *
 * A booking that isn't this expert's, or hasn't reached
 * confirmed/completed, resolves to null here exactly like one that
 * doesn't exist (spec section 52), so the caller can notFound() either
 * way -- this blocks the expert's own held/awaiting_payment bookings from
 * the detail page too, not just the list (spec section 55), and also
 * blocks a booking that only became reachable via some OTHER permissive
 * policy (e.g. this same account being the CUSTOMER on it).
 */
export async function getExpertSessionDetail(
  supabase: TypedClient,
  expertProfileId: string,
  reference: string,
): Promise<ExpertSessionDetail | null> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_reference", reference)
    .maybeSingle();

  if (!booking) return null;
  if (booking.expert_profile_id !== expertProfileId) return null;
  if (!EXPERT_VISIBLE_STATUSES.includes(booking.booking_status as (typeof EXPERT_VISIBLE_STATUSES)[number])) {
    return null;
  }

  const [{ data: intake }, customer] = await Promise.all([
    supabase.from("booking_intake").select("*").eq("booking_id", booking.id).maybeSingle(),
    getCustomerContextForBooking(supabase, booking.id),
  ]);

  return { booking, intake: intake ?? null, customer };
}
