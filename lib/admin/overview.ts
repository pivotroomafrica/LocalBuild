import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type TypedClient = SupabaseClient<Database>;

const DAY = 86_400_000;
const PAID = ["confirmed", "completed"];
const TZ = "Africa/Addis_Ababa";

export const OVERVIEW_RANGES = [7, 30, 60] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

export type OverviewSession = {
  reference: string;
  date: string;
  time: string;
  customer: string;
  expert: string;
  format: string;
  state: "upcoming" | "live" | "done" | "unpaid";
};

export type OverviewDay = {
  /** YYYY-MM-DD, Addis Ababa calendar day. */
  day: string;
  label: string;
  /** Paid sessions taking place that day. */
  sessions: number;
  /** Paid bookings made that day (whenever the session is). */
  booked: number;
  isToday: boolean;
  isFuture: boolean;
};

export type AdminOverview = {
  range: OverviewRange;
  booked: number;
  bookedPrev: number;
  paid: number;
  commission: number;
  tookPlace: number;
  cancelled: number;
  daily: OverviewDay[];
  selectedDay: string;
  daySessions: OverviewSession[];
  upcoming: OverviewSession[];
  updatedAt: string;
  decisions: { icon: string; title: string; detail: string; href: string; count: number; urgent?: boolean }[];
  health: { liveExperts: number; applying: number; suspended: number; returningPct: number | null; payingClients: number };
};

/** Days shown after today on the chart, so booked-ahead sessions are visible. */
const AHEAD_DAYS = 7;

export function addisDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

/** Midnight in Addis Ababa (UTC+3, no daylight saving) for a YYYY-MM-DD day. */
function addisMidnight(day: string) {
  return Date.parse(`${day}T00:00:00+03:00`);
}

function shiftDay(day: string, days: number) {
  return addisDay(new Date(addisMidnight(day) + days * DAY + 12 * 3_600_000));
}

export function isDayString(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(addisMidnight(value)));
}

type SessionRow = {
  booking_reference: string;
  start_at: string;
  end_at: string;
  session_format: string;
  customer_id: string;
  expert_profile_id: string;
  booking_status: string;
};

/** Adds client and expert names to booking rows. */
async function withNames(supabase: TypedClient, rows: SessionRow[], now: number): Promise<OverviewSession[]> {
  if (rows.length === 0) return [];
  const expertIds = Array.from(new Set(rows.map((b) => b.expert_profile_id)));
  const { data: expertUsers } = await supabase.from("expert_profiles").select("id, user_id").in("id", expertIds);
  const userIds = Array.from(new Set([...rows.map((b) => b.customer_id), ...(expertUsers ?? []).map((e) => e.user_id)]));
  const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const expertUser = new Map((expertUsers ?? []).map((e) => [e.id, e.user_id]));

  return rows.map((b) => {
    const start = new Date(b.start_at).getTime();
    const end = new Date(b.end_at).getTime();
    return {
      reference: b.booking_reference,
      date: new Date(b.start_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }),
      time: new Date(b.start_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
      customer: nameOf.get(b.customer_id) ?? "Client",
      expert: nameOf.get(expertUser.get(b.expert_profile_id) ?? "") ?? "Expert",
      format: b.session_format === "online" ? "Google Meet" : "In person",
      state: !PAID.includes(b.booking_status)
        ? "unpaid"
        : now >= end
          ? "done"
          : now >= start
            ? "live"
            : "upcoming",
    };
  });
}

const SESSION_COLUMNS =
  "booking_reference, start_at, end_at, session_format, customer_id, expert_profile_id, booking_status";

/** Admin overview figures (website design), all read under admin RLS.
 * Money is what was actually verified: payments marked verified (bank) or
 * paid (Chapa); commission is the per-booking snapshot (047c). */
export async function getAdminOverview(
  supabase: TypedClient,
  range: OverviewRange = 30,
  selectedDay?: string,
): Promise<AdminOverview> {
  const now = Date.now();
  const today = addisDay(new Date(now));
  const day = isDayString(selectedDay) ? selectedDay : today;
  // Chart: the last `range` days including today, plus the week ahead.
  const firstDay = shiftDay(today, -(range - 1));
  const lastDay = shiftDay(today, AHEAD_DAYS);
  const sinceRange = new Date(addisMidnight(firstDay)).toISOString();
  const sincePrev = new Date(addisMidnight(firstDay) - range * DAY).toISOString();
  const chartEnd = new Date(addisMidnight(lastDay) + DAY).toISOString();

  const [
    { data: recentBookings },
    { data: payments },
    { count: cancelled },
    { count: submitted },
    { count: pendingPayments },
    { count: reviewPayments },
    { count: failedJobs },
    { count: followups },
    { data: experts },
    { data: allPaid },
  ] = await Promise.all([
    // Paid bookings made since the previous period began, or taking place
    // anywhere on the chart.
    supabase
      .from("bookings")
      .select("id, created_at, start_at, end_at, commission_amount, base_price, booking_status")
      .in("booking_status", PAID)
      .or(`created_at.gte.${sincePrev},and(start_at.gte.${sinceRange},start_at.lt.${chartEnd})`),
    supabase
      .from("payments")
      .select("amount_paid, payment_status, verified_at, updated_at")
      .in("payment_status", ["verified", "paid"])
      .gte("updated_at", sinceRange),
    supabase.from("booking_cancellations").select("id", { count: "exact", head: true }).gte("cancelled_at", sinceRange),
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
  const booked = bookings.filter((b) => b.created_at >= sinceRange).length;
  const bookedPrev = bookings.filter((b) => b.created_at >= sincePrev && b.created_at < sinceRange).length;
  const tookPlace = bookings.filter((b) => b.start_at >= sinceRange && new Date(b.end_at).getTime() < now);
  const commission = tookPlace.reduce(
    (sum, b) => sum + Number(b.commission_amount ?? Math.round(Number(b.base_price) * 20) / 100),
    0,
  );
  const paid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount_paid), 0);

  const sessionsPerDay = new Map<string, number>();
  const bookedPerDay = new Map<string, number>();
  for (const b of bookings) {
    const sessionDay = addisDay(new Date(b.start_at));
    sessionsPerDay.set(sessionDay, (sessionsPerDay.get(sessionDay) ?? 0) + 1);
    const bookedDay = addisDay(new Date(b.created_at));
    bookedPerDay.set(bookedDay, (bookedPerDay.get(bookedDay) ?? 0) + 1);
  }
  const daily: OverviewDay[] = Array.from({ length: range + AHEAD_DAYS }, (_, i) => {
    const d = shiftDay(firstDay, i);
    return {
      day: d,
      label: new Date(addisMidnight(d) + 12 * 3_600_000).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: TZ,
      }),
      sessions: sessionsPerDay.get(d) ?? 0,
      booked: bookedPerDay.get(d) ?? 0,
      isToday: d === today,
      isFuture: d > today,
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

  // Every session on the chosen day (paid ones, plus ones still waiting
  // for payment), and the next paid sessions from now.
  const [{ data: dayRows }, { data: nextRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select(SESSION_COLUMNS)
      .in("booking_status", [...PAID, "awaiting_payment", "held"])
      .gte("start_at", new Date(addisMidnight(day)).toISOString())
      .lt("start_at", new Date(addisMidnight(day) + DAY).toISOString())
      .order("start_at"),
    supabase
      .from("bookings")
      .select(SESSION_COLUMNS)
      .in("booking_status", PAID)
      .gt("end_at", new Date(now).toISOString())
      .order("start_at")
      .limit(6),
  ]);
  const [daySessions, upcoming] = await Promise.all([
    withNames(supabase, dayRows ?? [], now),
    withNames(supabase, nextRows ?? [], now),
  ]);

  const expertRows = experts ?? [];
  const perCustomer = new Map<string, number>();
  for (const row of allPaid ?? []) perCustomer.set(row.customer_id, (perCustomer.get(row.customer_id) ?? 0) + 1);
  const payingClients = perCustomer.size;
  const returning = Array.from(perCustomer.values()).filter((n) => n > 1).length;

  return {
    range,
    booked,
    bookedPrev,
    paid,
    commission,
    tookPlace: tookPlace.length,
    cancelled: cancelled ?? 0,
    daily,
    selectedDay: day,
    daySessions,
    upcoming,
    updatedAt: new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }),
    decisions,
    health: {
      liveExperts: expertRows.filter((e) => e.profile_status === "published").length,
      applying: expertRows.filter((e) => e.application_status === "submitted" || e.application_status === "draft").length,
      suspended: expertRows.filter((e) => e.profile_status === "suspended").length,
      returningPct: payingClients > 0 ? Math.round((returning / payingClients) * 100) : null,
      payingClients,
    },
  };
}
