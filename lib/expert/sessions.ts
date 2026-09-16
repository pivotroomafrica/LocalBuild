import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Booking, BookingIntake, BookingStatus, SessionFormat } from "@/types/booking";

type TypedClient = SupabaseClient<Database>;

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
 * Every session this expert can see at all (spec section 25) --
 * bookings_select_own_expert (039) already restricts the rows a plain
 * select can return to this caller's own expert_profile_id AND
 * booking_status in ('confirmed', 'completed'); a held/awaiting_payment/
 * expired booking with this expert is invisible here at the database
 * level, not merely filtered out in this function.
 */
export async function getExpertSessions(supabase: TypedClient): Promise<ExpertSessionSummary[]> {
  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
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
 * over-fetch). */
export async function getExpertNextSession(supabase: TypedClient): Promise<ExpertSessionSummary | null> {
  const nowIso = new Date().toISOString();

  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
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
 * Session detail for the expert side (spec sections 24-31, 55). Ownership
 * and status are enforced twice over -- bookings_select_own_expert (039)
 * for the booking row itself, booking_intake_select_expert (039) for the
 * intake, and get_customer_context_for_booking()'s own internal
 * re-validation for the customer projection. A booking that exists but
 * isn't this expert's, or hasn't reached confirmed/completed, resolves to
 * null here exactly like one that doesn't exist (spec section 52), so the
 * caller can notFound() either way -- this also blocks an expert's own
 * held/awaiting_payment bookings from the detail page, not just the list
 * (spec section 55).
 */
export async function getExpertSessionDetail(
  supabase: TypedClient,
  reference: string,
): Promise<ExpertSessionDetail | null> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_reference", reference)
    .maybeSingle();

  if (!booking) return null;

  const [{ data: intake }, customer] = await Promise.all([
    supabase.from("booking_intake").select("*").eq("booking_id", booking.id).maybeSingle(),
    getCustomerContextForBooking(supabase, booking.id),
  ]);

  return { booking, intake: intake ?? null, customer };
}
