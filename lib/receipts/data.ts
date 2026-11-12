import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ReceiptView } from "@/components/receipts/ReceiptPanel";

type TypedClient = SupabaseClient<Database>;

/** The signed-in client's receipt request for a booking (RLS: own rows
 * only), with a one-hour download link once a file is attached. */
export async function getReceiptForBooking(supabase: TypedClient, bookingId: string): Promise<ReceiptView> {
  const { data } = await supabase
    .from("receipt_requests")
    .select("status, receipt_name, requested_at, issued_at, file_path")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (!data) return null;

  let downloadUrl: string | null = null;
  if (data.file_path) {
    // The row was read under the client's own RLS, so they own it; the
    // bucket is admin-only, hence the service role for the signed link.
    const { data: signed } = await createServiceRoleClient()
      .storage.from("issued-receipts")
      .createSignedUrl(data.file_path, 60 * 60);
    downloadUrl = signed?.signedUrl ?? null;
  }
  return {
    status: data.status === "issued" ? "issued" : "requested",
    receiptName: data.receipt_name,
    requestedAt: data.requested_at,
    issuedAt: data.issued_at,
    downloadUrl,
  };
}
