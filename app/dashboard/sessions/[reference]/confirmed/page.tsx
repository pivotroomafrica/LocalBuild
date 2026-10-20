import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCustomerPage, getCustomerSessionDetail } from "@/lib/dashboard/data";
import { googleCalendarUrl, sessionCalendarEvent } from "@/lib/booking/calendar";
import { isCancellableByCustomer } from "@/lib/booking/data";
import { formatEtb, initialsOf } from "@/components/site/format";
import { relativeDays } from "@/lib/utils/greeting";
import { PollRefresh } from "@/components/session/PollRefresh";

const TZ_FALLBACK = "Africa/Addis_Ababa";

function when(iso: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString("en-GB", { ...opts, timeZone: tz });
}

/**
 * Booking confirmed (website design flow): where Chapa and the booking
 * card send the customer after paying. Three real states -- payment still
 * being confirmed, payment not completed, and paid -- read from the
 * booking and its latest payment; nothing on the page is invented.
 */
export default async function BookingConfirmedPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const supabase = await createClient();
  const { userId } = await requireCustomerPage(supabase, `/dashboard/sessions/${reference}/confirmed`);

  const detail = await getCustomerSessionDetail(supabase, userId, reference);
  if (!detail) notFound();

  const { booking, intake, payments, derivedState, expertName, expertSlug } = detail;
  const tz = booking.customer_timezone || TZ_FALLBACK;
  const tzLabel = tz === TZ_FALLBACK ? "Addis Ababa time" : `${tz} time`;
  const firstName = expertName.split(/\s+/)[0] || expertName;
  const latest = payments[0] ?? null;
  const retryHref = expertSlug ? `/experts/${expertSlug}?booking=${encodeURIComponent(reference)}` : `/dashboard/sessions/${reference}`;

  if (derivedState === "payment_processing" || derivedState === "payment_verification_pending") {
    const bank = derivedState === "payment_verification_pending";
    return (
      <div className="pcard stack" role="status" style={{ maxWidth: 720, gap: 16 }}>
        <PollRefresh />
        <span className="spin" aria-hidden="true" />
        <h1 className="ws-h1" style={{ fontSize: "clamp(28px, 3.4vw, 40px)" }}>
          {bank ? "We're checking your bank transfer." : "Waiting for Chapa to confirm your payment."}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {bank
            ? `Our team verifies every transfer by hand. Your time with ${firstName} is held while we check, and this page updates by itself.`
            : `Mobile money payments usually confirm in under a minute. Please don't pay again. Your time with ${firstName} is held while we wait, and this page updates by itself.`}
        </p>
        <span className="muted" style={{ fontSize: 14 }}>
          Reference <span className="num">{reference}</span> · If you were charged and this hasn&apos;t changed in 15 minutes,
          write to <a href="mailto:hello@pivotroom.africa">hello@pivotroom.africa</a>.
        </span>
      </div>
    );
  }

  if (derivedState === "payment_needs_attention" || derivedState === "awaiting_payment" || derivedState === "time_reserved") {
    const failed = derivedState === "payment_needs_attention" || latest?.payment_status === "failed";
    return (
      <div className="pcard stack" role={failed ? "alert" : "status"} style={{ maxWidth: 720, gap: 16 }}>
        <span className="circle-icon" aria-hidden="true">
          <span className="ms" style={{ fontSize: 26 }}>
            {failed ? "credit_card_off" : "schedule"}
          </span>
        </span>
        <h1 className="ws-h1" style={{ fontSize: "clamp(28px, 3.4vw, 40px)" }}>
          {failed ? "Your payment didn't go through." : "Your booking isn't paid yet."}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {failed ? "Nothing was confirmed. " : ""}
          {booking.hold_expires_at
            ? `We're holding ${when(booking.start_at, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} with ${firstName} until ${when(booking.hold_expires_at, tz, { hour: "2-digit", minute: "2-digit" })} so you can try again.`
            : `Pick the time again on ${firstName}'s profile to continue.`}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link href={retryHref} className="btn btn-ink md">
            {failed ? "Try again" : "Finish paying"}{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
          <Link href="/dashboard/sessions" className="btn btn-line md even">
            My sessions
          </Link>
        </div>
        {failed ? (
          <span className="muted" style={{ fontSize: 14 }}>
            Common reasons: not enough balance, a daily telebirr limit, or the confirmation code timed out.
          </span>
        ) : null}
      </div>
    );
  }

  if (derivedState !== "confirmed" && derivedState !== "completed") {
    redirect(`/dashboard/sessions/${reference}`);
  }

  const online = booking.session_format === "online";
  const event = sessionCalendarEvent(booking, expertName);
  const base = Number(booking.base_price);
  const vat = booking.vat_amount != null ? Number(booking.vat_amount) : null;
  const total = booking.total_price != null ? Number(booking.total_price) : base;
  const vatPct = booking.vat_rate != null ? Math.round(Number(booking.vat_rate) * 100) : null;
  const cutoff = new Date(new Date(booking.start_at).getTime() - 24 * 3_600_000).toISOString();
  const canChange = isCancellableByCustomer(booking);
  const upcoming = derivedState === "confirmed";

  return (
    <div className="stack" style={{ gap: 24 }}>
      <section className="conf-hero" aria-labelledby="c-title">
        <span className="pill-blue">
          <span className="ms" aria-hidden="true">
            check_circle
          </span>
          Paid and confirmed
        </span>
        <div className="conf-row">
          <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
            <span className="ov-av" aria-hidden="true" style={{ background: "#e4e6e9", color: "#5c616a" }}>
              {initialsOf(expertName)}
            </span>
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <h1 id="c-title" className="ws-h1" style={{ fontSize: "clamp(28px, 3.4vw, 40px)" }}>
                You&apos;re booked with {firstName}.
              </h1>
              <span className="num" style={{ fontWeight: 500 }}>
                {when(booking.start_at, tz, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                {when(booking.start_at, tz, { hour: "2-digit", minute: "2-digit" })} to{" "}
                {when(booking.end_at, tz, { hour: "2-digit", minute: "2-digit" })} · {tzLabel}
              </span>
              <span className="muted">
                {online
                  ? "Google Meet · the link is below and in your email"
                  : "In person · the meeting place is confirmed before your session"}
              </span>
            </div>
          </div>
          {upcoming ? (
            <div className="stack" style={{ alignItems: "flex-end", gap: 0 }}>
              <span className="d num" style={{ fontSize: 28 }}>
                {relativeDays(booking.start_at)}
              </span>
            </div>
          ) : null}
        </div>
        {upcoming ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span className="muted" style={{ fontSize: 14, marginInlineEnd: 4 }}>
              Add it to your calendar
            </span>
            <a className="cal" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
              <span className="ms" aria-hidden="true">
                calendar_month
              </span>
              Google Calendar<span className="sr">(opens in a new tab)</span>
            </a>
            <a className="cal" href={`/dashboard/sessions/${reference}/calendar.ics`}>
              <span className="ms" aria-hidden="true">
                download
              </span>
              Apple or Outlook (.ics)
            </a>
          </div>
        ) : null}
      </section>

      <div className="cg">
        <div className="stack" style={{ gap: 16 }}>
          {intake ? (
            <section className="panel stack" style={{ gap: 12 }}>
              <h2 className="ws-h2">What you told {firstName}</h2>
              <p style={{ margin: 0 }}>{intake.discussion_topic}</p>
              {intake.additional_context ? (
                <p className="muted" style={{ margin: 0 }}>
                  {intake.additional_context}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="panel stack" style={{ gap: 16 }}>
            <h2 className="ws-h2">What happens next</h2>
            <div className="tl">
              <div className="tli">
                <span className="tld">
                  <span className="ms">check</span>
                </span>
                <div className="stack">
                  <span style={{ fontWeight: 500 }}>{firstName} has your booking</span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    Including what you wrote about the session.
                  </span>
                </div>
              </div>
              <div className="tli">
                <span className="tld">
                  <span className="ms">mail</span>
                </span>
                <div className="stack">
                  <span style={{ fontWeight: 500 }}>Confirmation by email</span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    With the date, time and how to join.
                  </span>
                </div>
              </div>
              <div className="tli">
                <span className="tld">
                  <span className="ms">{online ? "videocam" : "location_on"}</span>
                </span>
                <div className="stack">
                  <span style={{ fontWeight: 500 }}>{online ? "Join on Google Meet" : "Meet in person"}</span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {online ? (
                      booking.calendar_meeting_url ? (
                        <a href={booking.calendar_meeting_url} target="_blank" rel="noopener noreferrer">
                          {booking.calendar_meeting_url.replace(/^https?:\/\//, "")}
                        </a>
                      ) : (
                        "The meeting link is being prepared and will appear here and in your email."
                      )
                    ) : (
                      "The meeting place is confirmed before your session."
                    )}
                  </span>
                </div>
              </div>
              <div className="tli">
                <span className="tld">
                  <span className="ms">star</span>
                </span>
                <div className="stack">
                  <span style={{ fontWeight: 500 }}>Afterwards, a two-minute review</span>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {firstName} is paid once the session has taken place.
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="stack" style={{ gap: 16 }}>
          <section className="panel stack" style={{ gap: 4 }}>
            <h2 className="ws-h2" style={{ marginBlockEnd: 8 }}>
              Receipt
            </h2>
            <div className="row2">
              <span>{booking.duration_minutes}-minute session</span>
              <span className="num">{formatEtb(base)}</span>
            </div>
            {vat != null ? (
              <div className="row2">
                <span>VAT{vatPct != null ? ` · ${vatPct}%` : ""}</span>
                <span className="num">{formatEtb(vat)}</span>
              </div>
            ) : null}
            <div className="row2 total">
              <span>
                Paid
                {latest ? (latest.payment_method === "chapa" ? " with Chapa" : " by bank transfer") : ""}
              </span>
              <span className="d num">{formatEtb(total)}</span>
            </div>
            <span className="muted" style={{ fontSize: 14, marginBlockStart: 8 }}>
              Reference <span className="num">{reference}</span>
            </span>
          </section>
          {upcoming ? (
            <section className="panel stack" style={{ gap: 12 }}>
              <h2 className="ws-h2">Plans change</h2>
              <p className="muted" style={{ margin: 0 }}>
                {canChange ? (
                  <>
                    Until{" "}
                    <span className="num" style={{ color: "#0d0f12", fontWeight: 500 }}>
                      {when(cutoff, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>{" "}
                    you can move it for free, or cancel it. After that, the session can&apos;t be changed or refunded.
                  </>
                ) : (
                  "The 24-hour window for changes has passed. If something serious came up, write to us."
                )}
              </p>
              <Link href={`/dashboard/sessions/${reference}/manage`} className="btn btn-line md even" style={{ alignSelf: "flex-start" }}>
                Reschedule or cancel
              </Link>
            </section>
          ) : null}
        </aside>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link href="/dashboard/sessions" className="btn btn-ink md">
          Go to my sessions{" "}
          <span className="ms af" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
        <Link href="/match" className="btn btn-line md even">
          Book a second expert
        </Link>
      </div>
    </div>
  );
}
