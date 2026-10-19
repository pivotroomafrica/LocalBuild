import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getCustomerContextForBooking } from "@/lib/expert/sessions";

type TypedClient = SupabaseClient<Database>;

const PAID = ["confirmed", "completed"];
const TZ = "Africa/Addis_Ababa";

export type ExpertBookingRow = {
  id: string;
  booking_reference: string;
  customer_id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  session_format: string;
  expert_timezone: string;
  base_price: number;
  commission_amount: number | null;
  expert_payout_amount: number | null;
  calendar_meeting_url: string | null;
};

/** The expert's share of one booking. Bookings made before migration 047
 * have no snapshot; for those the 20% commission is applied to the price. */
export function payoutOf(row: Pick<ExpertBookingRow, "base_price" | "expert_payout_amount">): number {
  if (row.expert_payout_amount != null) return Number(row.expert_payout_amount);
  return Math.round(Number(row.base_price) * 0.8 * 100) / 100;
}

function monthKey(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date(iso));
}

/** Paid bookings for this expert only (explicit expert_profile_id filter,
 * never RLS alone -- see getExpertSessions). */
export async function getExpertPaidBookings(supabase: TypedClient, expertProfileId: string): Promise<ExpertBookingRow[]> {
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, booking_reference, customer_id, start_at, end_at, duration_minutes, session_format, expert_timezone, base_price, commission_amount, expert_payout_amount, calendar_meeting_url",
    )
    .eq("expert_profile_id", expertProfileId)
    .in("booking_status", PAID)
    .order("start_at", { ascending: true });
  return (data ?? []) as ExpertBookingRow[];
}

export type UpcomingSession = ExpertBookingRow & { customerName: string; customerRole: string | null; topic: string | null };

export type ExpertOverview = {
  next: UpcomingSession | null;
  thisWeek: UpcomingSession[];
  earnedThisMonth: number;
  sessionsThisMonth: number;
  upcomingThisMonth: number;
  ratingAvg: number | null;
  reviewCount: number;
  bookedAgainPct: number | null;
  distinctClients: number;
};

export async function getExpertOverview(supabase: TypedClient, expertProfileId: string): Promise<ExpertOverview> {
  const [rows, { data: reviews }] = await Promise.all([
    getExpertPaidBookings(supabase, expertProfileId),
    supabase.from("expert_reviews").select("rating").eq("expert_profile_id", expertProfileId).eq("is_hidden", false),
  ]);

  const now = Date.now();
  const thisMonth = monthKey(new Date());
  const inMonth = rows.filter((row) => monthKey(row.start_at) === thisMonth);
  const earnedThisMonth = inMonth
    .filter((row) => new Date(row.end_at).getTime() < now)
    .reduce((sum, row) => sum + payoutOf(row), 0);

  const perClient = new Map<string, number>();
  for (const row of rows.filter((r) => new Date(r.end_at).getTime() < now)) {
    perClient.set(row.customer_id, (perClient.get(row.customer_id) ?? 0) + 1);
  }
  const distinctClients = perClient.size;
  const returning = Array.from(perClient.values()).filter((n) => n > 1).length;

  const weekAhead = now + 7 * 86_400_000;
  const upcomingRows = rows.filter((row) => new Date(row.start_at).getTime() > now);
  const weekRows = upcomingRows.filter((row) => new Date(row.start_at).getTime() <= weekAhead).slice(0, 6);
  const enrichRows = weekRows.length > 0 ? weekRows : upcomingRows.slice(0, 1);

  const enriched: UpcomingSession[] = await Promise.all(
    enrichRows.map(async (row) => {
      const [context, { data: intake }] = await Promise.all([
        getCustomerContextForBooking(supabase, row.id),
        supabase.from("booking_intake").select("discussion_topic").eq("booking_id", row.id).maybeSingle(),
      ]);
      const role = [context?.currentRole, context?.companyName].filter(Boolean).join(", ");
      return {
        ...row,
        customerName: context?.fullName ?? "Client",
        customerRole: role || null,
        topic: intake?.discussion_topic ?? null,
      };
    }),
  );

  const ratings = (reviews ?? []).map((review) => review.rating);
  return {
    next: enriched[0] ?? null,
    thisWeek: weekRows.length > 0 ? enriched : [],
    earnedThisMonth,
    sessionsThisMonth: inMonth.length,
    upcomingThisMonth: inMonth.filter((row) => new Date(row.start_at).getTime() > now).length,
    ratingAvg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    reviewCount: ratings.length,
    bookedAgainPct: distinctClients > 0 ? Math.round((returning / distinctClients) * 100) : null,
    distinctClients,
  };
}

/** What a published profile is still missing, in the order worth fixing. */
export function profileCompleteness(profile: {
  profile_image_path: string | null;
  headline: string | null;
  short_bio: string | null;
  expertise_summary: string | null;
  problems_help_with: string | null;
  who_i_help: string | null;
  career_highlights: string | null;
  linkedin_url: string | null;
  languages: string[] | null;
  response_time: string | null;
  experience: unknown;
}): { pct: number; next: string | null } {
  const checks: [boolean, string][] = [
    [Boolean(profile.profile_image_path), "Add a photo"],
    [Boolean(profile.headline), "Add a headline"],
    [Boolean(profile.short_bio), "Write a short bio"],
    [Boolean(profile.expertise_summary), "Describe your expertise"],
    [Boolean(profile.problems_help_with), "List the problems you help with"],
    [Boolean(profile.who_i_help), "Say who you help"],
    [(profile.languages ?? []).length > 0, "Add the languages you hold sessions in"],
    [Boolean(profile.response_time), "Say how quickly you reply"],
    [Array.isArray(profile.experience) && profile.experience.length > 0, "Add your experience timeline"],
    [Boolean(profile.career_highlights), "Add career highlights"],
    [Boolean(profile.linkedin_url), "Add your LinkedIn"],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { pct: Math.round((done / checks.length) * 100), next: checks.find(([ok]) => !ok)?.[1] ?? null };
}

/** Paid sessions that have already taken place, newest first. */
export async function getExpertPastPaidBookings(supabase: TypedClient, expertProfileId: string) {
  const now = Date.now();
  return (await getExpertPaidBookings(supabase, expertProfileId))
    .filter((row) => new Date(row.end_at).getTime() < now)
    .reverse();
}
