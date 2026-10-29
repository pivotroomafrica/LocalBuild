import { createServiceRoleClient } from "@/lib/supabase/service";

export type SessionArea = "client" | "expert";

/**
 * Where a session link from an email should take the signed-in person.
 * Emails go to both the client and the expert, and the same browser may be
 * signed in to the other account, so a link that isn't for this account's
 * side is forwarded to the side it is for (or the admin booking page)
 * rather than answering "not found". Read with the service role, but only
 * this person's relation to the booking is ever used; nothing about the
 * booking is returned.
 */
export async function resolveSessionRoute(
  userId: string,
  reference: string,
  area: SessionArea,
): Promise<{ redirectTo: string } | { notYours: true } | { ok: true }> {
  const service = createServiceRoleClient();
  const { data: booking } = await service
    .from("bookings")
    .select("customer_id, expert_profile_id")
    .eq("booking_reference", reference)
    .maybeSingle();

  const [{ data: expert }, { data: profile }] = await Promise.all([
    booking
      ? service.from("expert_profiles").select("user_id").eq("id", booking.expert_profile_id).maybeSingle()
      : Promise.resolve({ data: null }),
    service.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);

  const ref = encodeURIComponent(reference);
  const isClient = booking?.customer_id === userId;
  const isExpert = expert?.user_id === userId;

  if (area === "client" && isClient) return { ok: true };
  if (area === "expert" && isExpert) return { ok: true };
  if (isClient) return { redirectTo: `/dashboard/sessions/${ref}` };
  if (isExpert) return { redirectTo: `/expert/sessions/${ref}` };
  if (booking && profile?.role === "admin") return { redirectTo: `/admin/bookings/${ref}` };
  return { notYours: true };
}
