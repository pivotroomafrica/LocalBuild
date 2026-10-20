import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerPage, getCustomerSessionDetail } from "@/lib/dashboard/data";
import { hasNotStarted, isCancellableByCustomer, isReschedulableByCustomer } from "@/lib/booking/data";
import { formatEtb, initialsOf } from "@/components/site/format";
import { ManageBooking, type ManageSituation } from "@/components/session/ManageBooking";
import type { SessionFormat } from "@/types/booking";

const TZ_FALLBACK = "Africa/Addis_Ababa";

/** Reschedule or cancel (website design flow) for one of the customer's
 * own bookings. The situation shown follows the real rules: more than 24
 * hours before (self-service), inside 24 hours (contact us), or cancelled
 * by the expert. */
export default async function ManageBookingPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const supabase = await createClient();
  const { userId } = await requireCustomerPage(supabase, `/dashboard/sessions/${reference}/manage`);

  const detail = await getCustomerSessionDetail(supabase, userId, reference);
  if (!detail) notFound();

  const { booking, cancellation, expertName, expertSlug } = detail;
  const tz = booking.customer_timezone || TZ_FALLBACK;
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-GB", { ...opts, timeZone: tz });

  let situation: ManageSituation | null = null;
  if (booking.booking_status === "cancelled" && cancellation?.actor_type === "expert") situation = "expert";
  else if (booking.booking_status === "confirmed" && isReschedulableByCustomer(booking) && isCancellableByCustomer(booking)) situation = "free";
  else if (booking.booking_status === "confirmed" && hasNotStarted(booking)) situation = "late";

  const total = booking.total_price != null ? Number(booking.total_price) : Number(booking.base_price);
  const currentLabel = fmt(booking.start_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const cutoffLabel = fmt(new Date(new Date(booking.start_at).getTime() - 24 * 3_600_000).toISOString(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="pcard stack" style={{ maxWidth: 760, gap: 28 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", paddingBlockEnd: 20, borderBottom: "1px solid #e4e6e9" }}>
        <span className="ov-av" aria-hidden="true" style={{ width: 52, height: 52, background: "#e4e6e9", color: "#5c616a", fontSize: 16 }}>
          {initialsOf(expertName)}
        </span>
        <span className="stack" style={{ lineHeight: 1.35, minWidth: 0 }}>
          <span className="d" style={{ fontSize: 18 }}>
            {expertName}
          </span>
          <span className="muted num" style={{ fontSize: 14 }}>
            {currentLabel} · {booking.duration_minutes} min · {booking.session_format === "online" ? "Google Meet" : "In person"}
          </span>
          <span className="muted num" style={{ fontSize: 14 }}>
            Paid {formatEtb(total)} · {reference}
          </span>
        </span>
      </div>

      {situation ? (
        <ManageBooking
          situation={situation}
          bookingId={booking.id}
          reference={reference}
          expertName={expertName}
          expertSlug={expertSlug}
          durationMinutes={booking.duration_minutes}
          sessionFormat={booking.session_format as SessionFormat}
          customerTimezone={booking.customer_timezone}
          currentLabel={currentLabel}
          cutoffLabel={cutoffLabel}
          paidLabel={formatEtb(total)}
        />
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <h1 className="ws-h1" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
            This booking can&apos;t be changed here.
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Only confirmed upcoming sessions can be moved or cancelled. If you need help, write to{" "}
            <a href="mailto:hello@pivotroom.africa">hello@pivotroom.africa</a>.
          </p>
          <Link href={`/dashboard/sessions/${reference}`}>Back to the session</Link>
        </div>
      )}
    </div>
  );
}
