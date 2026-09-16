import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Payment } from "@/types/payment";

type TypedClient = SupabaseClient<Database>;

/** Every payment attempt for one booking, newest first -- history is
 * never overwritten (spec section 26), so a booking can have more than
 * one row here (a rejected attempt followed by a resubmission). RLS
 * (payments_select_own / payments_select_admin, 037) scopes this to the
 * caller's own booking or an admin. */
export async function getPaymentsForBooking(
  supabase: TypedClient,
  bookingId: string,
): Promise<Payment[]> {
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("submitted_at", { ascending: false });
  return data ?? [];
}

/** The one active (pending_verification) attempt for a booking, if any --
 * at most one can exist (payments_one_pending_per_booking, 036). */
export async function getActivePaymentForBooking(
  supabase: TypedClient,
  bookingId: string,
): Promise<Payment | null> {
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("payment_status", "pending_verification")
    .maybeSingle();
  return data;
}

/** Most recent attempt regardless of status -- used to show a rejection
 * reason, or the verified record, once there is no longer an active one. */
export async function getLatestPaymentForBooking(
  supabase: TypedClient,
  bookingId: string,
): Promise<Payment | null> {
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Receipt is sensitive financial evidence (spec section 28) -- never a
 * public URL, only a short-lived signed one generated server-side for
 * the owning customer or an admin (both covered by RLS on the storage
 * object itself; the signed URL is just a time-boxed capability on top). */
export async function getReceiptSignedUrl(
  supabase: TypedClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("manual-payment-receipts").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export type AdminPaymentTab = "pending_verification" | "verified" | "rejected";

export const ADMIN_PAYMENT_TABS: { tab: AdminPaymentTab; label: string }[] = [
  { tab: "pending_verification", label: "Pending Verification" },
  { tab: "verified", label: "Verified" },
  { tab: "rejected", label: "Rejected" },
];

export type AdminPaymentListRow = {
  id: string;
  bookingReference: string;
  customerName: string;
  expertName: string;
  expectedAmount: number;
  amountPaid: number;
  currency: string;
  bankUsed: string;
  transactionReference: string;
  submittedAt: string;
  amountMismatch: boolean;
};

/** Admin queue, one lifecycle tab at a time (same "no fake counts, no
 * complex filtering" pattern as the Phase 3 expert-application queue).
 * Nested embeds are hinted with their exact constraint names because
 * both `payments` and `bookings` carry more than one foreign key into
 * `profiles`/`expert_profiles` -- PostgREST cannot pick one on its own. */
export async function getAdminPaymentList(
  supabase: TypedClient,
  tab: AdminPaymentTab,
): Promise<AdminPaymentListRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      `id, expected_amount, amount_paid, currency, bank_used, transaction_reference, submitted_at,
       bookings!payments_booking_id_fkey(
         booking_reference,
         expert_profiles!bookings_expert_profile_id_fkey(
           profiles!expert_profiles_user_id_fkey(full_name)
         )
       ),
       profiles!payments_customer_id_fkey(full_name)`,
    )
    .eq("payment_status", tab)
    .order("submitted_at", { ascending: tab === "pending_verification" });

  if (error) {
    console.error("getAdminPaymentList: failed to load payments", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const booking = row.bookings as unknown as {
      booking_reference: string;
      expert_profiles: { profiles: { full_name: string } | null } | null;
    } | null;
    const customer = row.profiles as unknown as { full_name: string } | null;

    return {
      id: row.id,
      bookingReference: booking?.booking_reference ?? "—",
      customerName: customer?.full_name ?? "Unknown",
      expertName: booking?.expert_profiles?.profiles?.full_name ?? "Unknown",
      expectedAmount: Number(row.expected_amount),
      amountPaid: Number(row.amount_paid),
      currency: row.currency,
      bankUsed: row.bank_used,
      transactionReference: row.transaction_reference,
      submittedAt: row.submitted_at,
      amountMismatch: Number(row.expected_amount) !== Number(row.amount_paid),
    };
  });
}

export type AdminPaymentDetail = {
  payment: Payment;
  bookingReference: string;
  bookingDurationMinutes: number;
  bookingFormat: string;
  bookingStartAt: string;
  bookingExpertTimezone: string;
  customerName: string;
  expertName: string;
  receiptSignedUrl: string | null;
  isDuplicateTransactionReference: boolean;
};

/** Full detail for one payment (spec section 22) -- booking + payment +
 * receipt, plus a duplicate-transaction-reference flag (spec section 18,
 * 65: "at minimum flag duplicates to admin" -- never a hard uniqueness
 * constraint, since some banks reuse references). */
export async function getAdminPaymentDetail(
  supabase: TypedClient,
  paymentId: string,
): Promise<AdminPaymentDetail | null> {
  const { data: payment } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (!payment) return null;

  const [{ data: booking }, { data: customer }, { data: duplicates }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `booking_reference, duration_minutes, session_format, start_at, expert_timezone,
         expert_profiles!bookings_expert_profile_id_fkey(profiles!expert_profiles_user_id_fkey(full_name))`,
      )
      .eq("id", payment.booking_id)
      .maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", payment.customer_id).maybeSingle(),
    supabase
      .from("payments")
      .select("id")
      .eq("transaction_reference", payment.transaction_reference)
      .neq("id", paymentId)
      .limit(1),
  ]);

  const expertProfile = booking?.expert_profiles as unknown as { profiles: { full_name: string } | null } | null;

  return {
    payment,
    bookingReference: booking?.booking_reference ?? "—",
    bookingDurationMinutes: booking?.duration_minutes ?? 0,
    bookingFormat: booking?.session_format ?? "—",
    bookingStartAt: booking?.start_at ?? "",
    bookingExpertTimezone: booking?.expert_timezone ?? "",
    customerName: customer?.full_name ?? "Unknown",
    expertName: expertProfile?.profiles?.full_name ?? "Unknown",
    receiptSignedUrl: await getReceiptSignedUrl(supabase, payment.receipt_path),
    isDuplicateTransactionReference: (duplicates ?? []).length > 0,
  };
}
