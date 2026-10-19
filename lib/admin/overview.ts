import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type TypedClient = SupabaseClient<Database>;

const DAY = 86_400_000;
const PAID = ["confirmed", "completed"];
const TZ = "Africa/Addis_Ababa";

export type AdminOverview = {
  booked30: number;
  bookedPrev30: number;
  paid30: number;
  commission30: number;
  tookPlace30: number;
  cancelled30: number;
  weekly: { label: string; count: number }[];
  decisions: { icon: string; title: string; detail: string; href: string; count: number; urgent?: boolean }[];
  today: {
    reference: string;
    time: string;
    customer: string;
    expert: string;
    format: string;
    state: "upcoming" | "live" | "done";
  }[];
  health: { liveExperts: number; applying: number; suspended: number; returningPct: number | null; payingClients: number };
};

function addisDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

/** Admin overview figures (website design), all read under admin RLS.
 * Money is what was actually verified: payments marked verified (bank) or
 * paid (Chapa); commission is the per-booking snapshot (047c). */
export async function getAdminOverview(supabase: TypedClient): Promise<AdminOverview> {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const since60 = new Date(now - 60 * DAY).toISOString();
  const since12w = new Date(now - 84 * DAY).toISOString();

  const [
    { data: recentBookings },
    { data: payments },
    { count: cancelled30 },
    { count: submitted },
    { count: pendingPayments },
    { count: reviewPayments },
    { count: failedJobs },
    { count: followups },
    { data: experts },
    { data: allPaid },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, created_at, start_at, end_at, commission_amount, base_price, booking_status")
      .in("booking_status", PAID)
      .gte("created_at", since12w),
    supabase
      .from("payments")
      .select("amount_paid, payment_status, verified_at, updated_at")
      .in("payment_status", ["verified", "paid"])
      .gte("updated_at", since30),
    supabase.from("booking_cancellations").select("id", { count: "exact", head: true }).gte("cancelled_at", since30),
    supabase.from("expert_profiles").select("id", { count: "exact", head: true }).eq("application_status", "submitted"),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("payment_status", "pending_verification"),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("payment_status", "requires_review"),
    supabase.from("integration_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase
      .from("booking_cancellations")
      .select("id", { count: "exact", head: true })
      .eq("financial_followup_required", true),
    supabase.from("expert_profiles").select("application_status, profile_status"),
    supabase.from("bookings").select("customer_id").in("booking_status", PAID),
  ]);

  const bookings = recentBookings ?? [];
  const booked30 = bookings.filter((b) => b.created_at >= since30).length;
  const bookedPrev30 = bookings.filter((b) => b.created_at >= since60 && b.created_at < since30).length;
  const tookPlace = bookings.filter((b) => b.start_at >= since30 && new Date(b.end_at).getTime() < now);
  const commission30 = tookPlace.reduce(
    (sum, b) => sum + Number(b.commission_amount ?? Math.round(Number(b.base_price) * 20) / 100),
    0,
  );
  const paid30 = (payments ?? []).reduce((sum, p) => sum + Number(p.amount_paid), 0);

  const weekly = Array.from({ length: 12 }, (_, i) => {
    const end = now - (11 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    return {
      label: new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ }),
      count: bookings.filter((b) => {
        const t = new Date(b.created_at).getTime();
        return t >= start && t < end;
      }).length,
    };
  });

  const decisions: AdminOverview["decisions"] = [
    {
      icon: "account_balance",
      title: `${pendingPayments ?? 0} bank ${pendingPayments === 1 ? "transfer" : "transfers"} to verify`,
      detail: "Clients are waiting for confirmation",
      href: "/admin/payments?tab=pending_verification",
      count: pendingPayments ?? 0,
      urgent: true,
    },
    {
      icon: "report",
      title: `${reviewPayments ?? 0} ${reviewPayments === 1 ? "payment needs" : "payments need"} review`,
      detail: "Amount or currency didn't match, or paid after the hold expired",
      href: "/admin/payments?tab=requires_review",
      count: reviewPayments ?? 0,
      urgent: true,
    },
    {
      icon: "how_to_reg",
      title: `${submitted ?? 0} expert ${submitted === 1 ? "application" : "applications"} submitted`,
      detail: "Waiting for a decision",
      href: "/admin/experts",
      count: submitted ?? 0,
    },
    {
      icon: "currency_exchange",
      title: `${followups ?? 0} paid ${followups === 1 ? "cancellation" : "cancellations"} to settle`,
      detail: "Refund or payout follow-up",
      href: "/admin/bookings",
      count: followups ?? 0,
    },
    {
      icon: "mail",
      title: `${failedJobs ?? 0} failed ${failedJobs === 1 ? "email or calendar job" : "email or calendar jobs"}`,
      detail: "Retry them from the booking page",
      href: "/admin/bookings",
      count: failedJobs ?? 0,
    },
  ].filter((item) => item.count > 0);

  // Today's paid sessions (Addis Ababa day) with both names.
  const today = addisDay(new Date());
  const { data: todays } = await supabase
    .from("bookings")
    .select("booking_reference, start_at, end_at, session_format, customer_id, expert_profile_id")
    .in("booking_status", PAID)
    .gte("start_at", new Date(now - DAY).toISOString())
    .lte("start_at", new Date(now + DAY).toISOString())
    .order("start_at");
  const todayRows = (todays ?? []).filter((b) => addisDay(new Date(b.start_at)) === today);

  const expertIds = Array.from(new Set(todayRows.map((b) => b.expert_profile_id)));
  const { data: expertUsers } = expertIds.length
    ? await supabase.from("expert_profiles").select("id, user_id").in("id", expertIds)
    : { data: [] as { id: string; user_id: string }[] };
  const userIds = Array.from(new Set([...todayRows.map((b) => b.customer_id), ...(expertUsers ?? []).map((e) => e.user_id)]));
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const expertUser = new Map((expertUsers ?? []).map((e) => [e.id, e.user_id]));

  const expertRows = experts ?? [];
  const perCustomer = new Map<string, number>();
  for (const row of allPaid ?? []) perCustomer.set(row.customer_id, (perCustomer.get(row.customer_id) ?? 0) + 1);
  const payingClients = perCustomer.size;
  const returning = Array.from(perCustomer.values()).filter((n) => n > 1).length;

  return {
    booked30,
    bookedPrev30,
    paid30,
    commission30,
    tookPlace30: tookPlace.length,
    cancelled30: cancelled30 ?? 0,
    weekly,
    decisions,
    today: todayRows.map((b) => {
      const start = new Date(b.start_at).getTime();
      const end = new Date(b.end_at).getTime();
      return {
        reference: b.booking_reference,
        time: new Date(b.start_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
        customer: nameOf.get(b.customer_id) ?? "Client",
        expert: nameOf.get(expertUser.get(b.expert_profile_id) ?? "") ?? "Expert",
        format: b.session_format === "online" ? "Google Meet" : "In person",
        state: now >= end ? "done" : now >= start ? "live" : "upcoming",
      };
    }),
    health: {
      liveExperts: expertRows.filter((e) => e.profile_status === "published").length,
      applying: expertRows.filter((e) => e.application_status === "submitted" || e.application_status === "draft").length,
      suspended: expertRows.filter((e) => e.profile_status === "suspended").length,
      returningPct: payingClients > 0 ? Math.round((returning / payingClients) * 100) : null,
      payingClients,
    },
  };
}
