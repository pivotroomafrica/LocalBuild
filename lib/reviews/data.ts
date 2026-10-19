import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type TypedClient = SupabaseClient<Database>;

type ReviewableBooking = { booking_status: string; end_at: string };

/** Same rule submit_expert_review() enforces (049b): paid and over. */
export function isReviewable(booking: ReviewableBooking): boolean {
  return (
    (booking.booking_status === "confirmed" || booking.booking_status === "completed") &&
    new Date(booking.end_at).getTime() < Date.now()
  );
}

/** The signed-in customer's own review of one booking, if any (RLS: own). */
export async function getOwnReviewForBooking(supabase: TypedClient, bookingId: string) {
  const { data } = await supabase
    .from("expert_reviews")
    .select("rating, body, created_at, is_hidden")
    .eq("booking_id", bookingId)
    .maybeSingle();
  return data;
}
