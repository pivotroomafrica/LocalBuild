import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getAdminBookingList } from "@/lib/booking/data";
import { describeSupabaseError } from "@/lib/supabase/errors";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/types/payment";

type TypedClient = SupabaseClient<Database>;

export const BOARD_VIEWS = [
  { view: "bookings", label: "Bookings", icon: "event" },
  { view: "applications", label: "Applications", icon: "how_to_reg" },
  { view: "payments", label: "Payments", icon: "payments" },
] as const;
export type BoardView = (typeof BOARD_VIEWS)[number]["view"];

export type BoardCard = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  meta: string;
  /** Short highlighted note, e.g. an amount or a warning. */
  badge?: string;
  warn?: boolean;
};

export type BoardColumn = {
  key: string;
  label: string;
  hint: string;
  tone: "action" | "progress" | "done" | "closed";
  cards: BoardCard[];
};

/** How many rows a board loads; the newest come first. */
const BOARD_LIMIT = 300;
const TZ = "Africa/Addis_Ababa";

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

function money(amount: number, currency: string) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

function column(key: string, label: string, hint: string, tone: BoardColumn["tone"], cards: BoardCard[]): BoardColumn {
  return { key, label, hint, tone, cards };
}

async function bookingsBoard(supabase: TypedClient): Promise<BoardColumn[]> {
  const rows = await getAdminBookingList(supabase, "all", undefined, BOARD_LIMIT);
  const now = Date.now();
  const card = (row: (typeof rows)[number]): BoardCard => ({
    id: row.id,
    href: `/admin/bookings/${row.bookingReference}`,
    title: `${row.customerName} → ${row.expertName}`,
    subtitle: `${when(row.startAt)} · ${row.durationMinutes} min · ${row.sessionFormat === "online" ? "Online" : "In person"}`,
    meta: row.bookingReference,
    badge: row.latestPaymentStatus ? PAYMENT_STATUS_LABELS[row.latestPaymentStatus] : undefined,
    warn: row.latestPaymentStatus === "pending_verification" || row.latestPaymentStatus === "requires_review",
  });
  const ended = (row: (typeof rows)[number]) => new Date(row.startAt).getTime() + row.durationMinutes * 60_000 <= now;
  const byStart = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.startAt.localeCompare(b.startAt);

  return [
    column(
      "held",
      "Time reserved",
      "Client is filling in details",
      "progress",
      rows.filter((r) => r.bookingStatus === "held").map(card),
    ),
    column(
      "awaiting_payment",
      "Awaiting payment",
      "Waiting for the client to pay or for you to verify",
      "action",
      rows.filter((r) => r.bookingStatus === "awaiting_payment").map(card),
    ),
    column(
      "upcoming",
      "Confirmed, upcoming",
      "Paid, session still to happen",
      "progress",
      rows
        .filter((r) => r.bookingStatus === "confirmed" && !ended(r))
        .sort(byStart)
        .map(card),
    ),
    column(
      "done",
      "Took place",
      "Session time has passed",
      "done",
      rows.filter((r) => r.bookingStatus === "completed" || (r.bookingStatus === "confirmed" && ended(r))).map(card),
    ),
    column(
      "cancelled",
      "Cancelled",
      "Cancelled by client, expert or admin",
      "closed",
      rows.filter((r) => r.bookingStatus === "cancelled").map(card),
    ),
    column(
      "expired",
      "Expired",
      "Reservation ran out unpaid",
      "closed",
      rows.filter((r) => r.bookingStatus === "expired").map(card),
    ),
  ];
}

async function applicationsBoard(supabase: TypedClient): Promise<BoardColumn[]> {
  const { data, error } = await supabase
    .from("expert_profiles")
    .select(
      "id, slug, headline, current_position, current_company, application_status, profile_status, submitted_at, updated_at, profiles!expert_profiles_user_id_fkey(full_name)",
    )
    .order("updated_at", { ascending: false })
    .limit(BOARD_LIMIT);
  if (error) console.error(`applicationsBoard: ${describeSupabaseError(error)}`);
  const rows = data ?? [];

  const card = (row: (typeof rows)[number]): BoardCard => ({
    id: row.id,
    href: `/admin/experts/${row.id}`,
    title: (row.profiles as { full_name: string } | null)?.full_name ?? "Unknown",
    subtitle:
      row.headline || [row.current_position, row.current_company].filter(Boolean).join(" at ") || "No headline yet",
    meta: row.submitted_at ? `Sent ${when(row.submitted_at)}` : `Last edited ${when(row.updated_at)}`,
  });
  const is = (application: string, profile?: string) => (row: (typeof rows)[number]) =>
    row.application_status === application && (profile === undefined || row.profile_status === profile);

  return [
    column("draft", "Draft", "Started, not sent yet", "progress", rows.filter(is("draft")).map(card)),
    column("submitted", "Submitted", "Waiting for your review", "action", rows.filter(is("submitted")).map(card)),
    column(
      "changes_requested",
      "Changes requested",
      "Waiting for the expert to update",
      "progress",
      rows.filter(is("changes_requested")).map(card),
    ),
    column(
      "approved",
      "Approved, not live",
      "Check the profile, then publish",
      "action",
      rows
        .filter(
          (r) =>
            r.application_status === "approved" && r.profile_status !== "published" && r.profile_status !== "suspended",
        )
        .map(card),
    ),
    column(
      "published",
      "Live",
      "Clients can book",
      "done",
      rows.filter((r) => r.profile_status === "published").map(card),
    ),
    column(
      "suspended",
      "Paused",
      "Hidden from clients",
      "closed",
      rows.filter((r) => r.profile_status === "suspended").map(card),
    ),
    column("rejected", "Not approved", "Application declined", "closed", rows.filter(is("rejected")).map(card)),
  ];
}

async function paymentsBoard(supabase: TypedClient): Promise<BoardColumn[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      `id, payment_method, payment_status, expected_amount, amount_paid, currency, bank_used, submitted_at,
       bookings!payments_booking_id_fkey(
         booking_reference,
         expert_profiles!bookings_expert_profile_id_fkey(profiles!expert_profiles_user_id_fkey(full_name))
       ),
       profiles!payments_customer_id_fkey(full_name)`,
    )
    .order("submitted_at", { ascending: false })
    .limit(BOARD_LIMIT);
  if (error) console.error(`paymentsBoard: ${describeSupabaseError(error)}`);
  const rows = data ?? [];

  const card = (row: (typeof rows)[number]): BoardCard => {
    const booking = row.bookings as unknown as {
      booking_reference: string;
      expert_profiles: { profiles: { full_name: string } | null } | null;
    } | null;
    const customer = (row.profiles as unknown as { full_name: string } | null)?.full_name ?? "Unknown";
    const mismatch = Number(row.expected_amount) !== Number(row.amount_paid);
    return {
      id: row.id,
      href: `/admin/payments/${row.id}`,
      title: `${customer} → ${booking?.expert_profiles?.profiles?.full_name ?? "Unknown"}`,
      subtitle: `${row.payment_method === "chapa" ? "Chapa" : row.bank_used || "Bank transfer"} · ${when(row.submitted_at)}`,
      meta: booking?.booking_reference ?? "—",
      badge: mismatch
        ? `Paid ${money(Number(row.amount_paid), row.currency)} of ${money(Number(row.expected_amount), row.currency)}`
        : money(Number(row.amount_paid || row.expected_amount), row.currency),
      warn: mismatch,
    };
  };
  const status =
    (...statuses: PaymentStatus[]) =>
    (row: (typeof rows)[number]) =>
      statuses.includes(row.payment_status as PaymentStatus);

  return [
    column(
      "pending_verification",
      "To verify",
      "Bank transfers waiting for you",
      "action",
      rows.filter(status("pending_verification")).map(card),
    ),
    column(
      "requires_review",
      "Needs review",
      "Paid, but something didn't match",
      "action",
      rows.filter(status("requires_review")).map(card),
    ),
    column(
      "initiated",
      "Chapa processing",
      "Client is in Chapa checkout",
      "progress",
      rows.filter(status("initiated")).map(card),
    ),
    column(
      "verified",
      "Verified",
      "Money received, booking confirmed",
      "done",
      rows.filter(status("verified", "paid")).map(card),
    ),
    column(
      "rejected",
      "Rejected or failed",
      "Not accepted",
      "closed",
      rows.filter(status("rejected", "failed", "refunded")).map(card),
    ),
  ];
}

export async function getAdminBoard(supabase: TypedClient, view: BoardView): Promise<BoardColumn[]> {
  if (view === "applications") return applicationsBoard(supabase);
  if (view === "payments") return paymentsBoard(supabase);
  return bookingsBoard(supabase);
}
