import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Minutes booked this calendar month in the expert's timezone: confirmed
 * bookings plus live holds, the same bucket the monthly-hours cap counts
 * (expert_booked_minutes_between, 060). For the Availability page meter.
 */
export async function bookedMinutesThisMonth(
  supabase: SupabaseClient<Database>,
  expertProfileId: string,
  timezone: string,
): Promise<number> {
  const now = new Date();
  const nowLocal = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const offsetMs = nowLocal.getTime() - now.getTime();
  const monthStart = new Date(new Date(nowLocal.getFullYear(), nowLocal.getMonth(), 1).getTime() - offsetMs);
  const monthEnd = new Date(new Date(nowLocal.getFullYear(), nowLocal.getMonth() + 1, 1).getTime() - offsetMs);

  const { data } = await supabase
    .from("bookings")
    .select("start_at, end_at, booking_status, hold_expires_at")
    .eq("expert_profile_id", expertProfileId)
    .gte("start_at", monthStart.toISOString())
    .lt("start_at", monthEnd.toISOString())
    .in("booking_status", ["confirmed", "held", "awaiting_payment"]);

  return (data ?? [])
    .filter((b) => b.booking_status === "confirmed" || (b.hold_expires_at && new Date(b.hold_expires_at) > now))
    .reduce((sum, b) => sum + (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000, 0);
}
