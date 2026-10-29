import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type TypedClient = SupabaseClient<Database>;

export type AdminPeopleKind = "clients" | "experts";
export type AdminPersonRow = Database["public"]["Functions"]["admin_people"]["Returns"][number];
export type AdminPerson = Database["public"]["Functions"]["admin_person"]["Returns"][number];

export type AdminPersonBooking = {
  reference: string;
  startAt: string;
  status: string;
  side: "client" | "expert";
};

/** Every client or every expert with contact details (admin only, see migration 055). */
export async function getAdminPeople(supabase: TypedClient, kind: AdminPeopleKind): Promise<AdminPersonRow[]> {
  const { data, error } = await supabase.rpc("admin_people", { p_kind: kind });
  if (error) throw new Error(`Couldn't load people: ${error.message}`);
  return data ?? [];
}

export async function getAdminPerson(supabase: TypedClient, userId: string): Promise<AdminPerson | null> {
  const { data, error } = await supabase.rpc("admin_person", { p_user_id: userId });
  if (error) return null;
  return data?.[0] ?? null;
}

/** Latest sessions this person booked or hosted. */
export async function getAdminPersonBookings(
  supabase: TypedClient,
  person: Pick<AdminPerson, "user_id" | "expert_profile_id">,
): Promise<AdminPersonBooking[]> {
  const filter = person.expert_profile_id
    ? `customer_id.eq.${person.user_id},expert_profile_id.eq.${person.expert_profile_id}`
    : `customer_id.eq.${person.user_id}`;
  const { data } = await supabase
    .from("bookings")
    .select("booking_reference, start_at, booking_status, customer_id")
    .or(filter)
    .order("start_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((row) => ({
    reference: row.booking_reference,
    startAt: row.start_at,
    status: row.booking_status,
    side: row.customer_id === person.user_id ? "client" : "expert",
  }));
}
