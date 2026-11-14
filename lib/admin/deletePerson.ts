import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type TypedClient = SupabaseClient<Database>;

const ACTIVE = ["held", "awaiting_payment", "confirmed"];

/** What deleting someone removes, shown to the admin before they confirm. */
export type DeletionImpact = {
  bookingsAsClient: number;
  bookingsAsExpert: number;
  paidSessions: number;
  payments: number;
  reviews: number;
  files: number;
  /** Upcoming sessions still on; deleting is refused until they're cancelled. */
  upcoming: { reference: string; startAt: string; side: "client" | "expert" }[];
  /** Storage files to remove after the account is gone. */
  paths: { bucket: string; path: string }[];
};

/**
 * Everything tied to one account, read with the service role (it spans
 * other people's rows: an expert's clients' bookings, payments, receipts).
 * The account itself is removed by deleting the auth user; the database
 * cascades from there (profiles -> expert profile, availability, bookings,
 * payments, reviews, receipt requests). Files in storage don't cascade, so
 * their paths are collected here.
 */
export async function getDeletionImpact(
  service: TypedClient,
  userId: string,
  expertProfileId: string | null,
): Promise<DeletionImpact> {
  const nowIso = new Date().toISOString();
  const bookingFilter = expertProfileId
    ? `customer_id.eq.${userId},expert_profile_id.eq.${expertProfileId}`
    : `customer_id.eq.${userId}`;

  const { data: bookings } = await service
    .from("bookings")
    .select("id, booking_reference, start_at, booking_status, customer_id, hold_expires_at")
    .or(bookingFilter);
  const all = bookings ?? [];
  const ids = all.map((b) => b.id);

  const [{ data: payments }, { data: receipts }, { count: reviewsWritten }, { count: reviewsAbout }, { data: expert }] =
    await Promise.all([
      ids.length
        ? service.from("payments").select("id, receipt_path").in("booking_id", ids)
        : Promise.resolve({ data: [] as { id: string; receipt_path: string | null }[] }),
      ids.length
        ? service.from("receipt_requests").select("file_path").in("booking_id", ids)
        : Promise.resolve({ data: [] as { file_path: string | null }[] }),
      service.from("expert_reviews").select("id", { count: "exact", head: true }).eq("customer_id", userId),
      expertProfileId
        ? service.from("expert_reviews").select("id", { count: "exact", head: true }).eq("expert_profile_id", expertProfileId)
        : Promise.resolve({ count: 0 }),
      expertProfileId
        ? service.from("expert_profiles").select("profile_image_path").eq("id", expertProfileId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const paths: { bucket: string; path: string }[] = [];
  if (expert?.profile_image_path) paths.push({ bucket: "expert-profile-images", path: expert.profile_image_path });
  for (const p of payments ?? []) if (p.receipt_path) paths.push({ bucket: "manual-payment-receipts", path: p.receipt_path });
  for (const r of receipts ?? []) if (r.file_path) paths.push({ bucket: "issued-receipts", path: r.file_path });

  const upcoming = all
    .filter(
      (b) =>
        b.start_at > nowIso &&
        ACTIVE.includes(b.booking_status) &&
        (b.booking_status === "confirmed" || (b.hold_expires_at && b.hold_expires_at > nowIso)),
    )
    .map((b) => ({
      reference: b.booking_reference,
      startAt: b.start_at,
      side: (b.customer_id === userId ? "client" : "expert") as "client" | "expert",
    }));

  return {
    bookingsAsClient: all.filter((b) => b.customer_id === userId).length,
    bookingsAsExpert: all.filter((b) => b.customer_id !== userId).length,
    paidSessions: all.filter((b) => b.booking_status === "confirmed" || b.booking_status === "completed").length,
    payments: (payments ?? []).length,
    reviews: (reviewsWritten ?? 0) + (reviewsAbout ?? 0),
    files: paths.length,
    upcoming,
    paths,
  };
}
