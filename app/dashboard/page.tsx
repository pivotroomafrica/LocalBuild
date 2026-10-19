import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  requireCustomerPage,
  getBookingMeetingUrl,
  getClientActivity,
  getDashboardOverview,
} from "@/lib/dashboard/data";
import { getDirectoryForRequest } from "@/lib/public/cached";
import { PendingActionCard } from "@/components/session/PendingActionCard";
import { formatEtb, initialsOf, summaryLine } from "@/components/site/format";
import { greeting, relativeDays, shortDate } from "@/lib/utils/greeting";

/** Client overview (website design): the next session, real activity
 * figures, anything that needs finishing, and published experts to book
 * next. Nothing here is invented: every figure is the customer's own. */
export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  const { userId } = await requireCustomerPage(supabase, "/dashboard");

  const [{ data: profile }, { nextConfirmedSession: next, actionablePendingSession }, activity, directory] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      getDashboardOverview(supabase, userId),
      getClientActivity(supabase, userId),
      getDirectoryForRequest(),
    ]);
  const meetingUrl = next && next.sessionFormat === "online" ? await getBookingMeetingUrl(supabase, next.bookingId) : null;

  const firstName = (profile?.full_name ?? "").split(/\s+/)[0];
  const suggestions = directory.filter((expert) => expert.startingPrice != null).slice(0, 3);

  const subtitle =
    activity.upcoming === 0
      ? "No sessions booked right now."
      : `You have ${activity.upcoming === 1 ? "one session" : `${activity.upcoming} sessions`} coming up.`;

  return (
    <div className="stack" style={{ gap: 32 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="ws-h1">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {subtitle}
        </p>
      </div>

      {next ? (
        <section className="ov-next ink" aria-label="Next session">
          <span className="ov-av" aria-hidden="true">
            {initialsOf(next.expertName)}
          </span>
          <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14, color: "#9ba1aa" }}>Next session · {relativeDays(next.startAt)}</span>
            <span className="d" style={{ fontSize: 24, lineHeight: 1.2 }}>
              {next.expertName}
            </span>
            <span className="num" style={{ color: "#7a94f0", fontWeight: 500 }}>
              {shortDate(next.startAt, next.customerTimezone)} · {next.durationMinutes} min ·{" "}
              {next.sessionFormat === "online" ? "Google Meet" : "In person"}
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {meetingUrl ? (
              <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-white md">
                Join on Google Meet{" "}
                <span className="ms ao" aria-hidden="true">
                  arrow_outward
                </span>
                <span className="sr">(opens in a new tab)</span>
              </a>
            ) : null}
            <Link href={`/dashboard/sessions/${next.bookingReference}`} className="btn btn-ghost-ink md even">
              {meetingUrl ? "Details" : "View session"}
            </Link>
          </div>
        </section>
      ) : (
        <section className="ov-next ink" aria-label="Book a session">
          <div className="stack" style={{ gap: 6, flex: 1 }}>
            <span className="d" style={{ fontSize: 24, lineHeight: 1.2 }}>
              Nothing booked yet
            </span>
            <span style={{ color: "#9ba1aa" }}>Tell us what you&apos;re facing and we&apos;ll find the person who has solved it.</span>
          </div>
          <Link href="/match" className="btn btn-white md">
            Find my match{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </section>
      )}

      {actionablePendingSession ? (
        <section className="stack" style={{ gap: 12 }}>
          <h2 className="ws-h2">Finish your booking</h2>
          <PendingActionCard session={actionablePendingSession} />
        </section>
      ) : null}

      <div className="stats">
        <div className="stat">
          <span className="k">Sessions completed</span>
          <span className="v num">{activity.sessionsCompleted}</span>
          <span className="s">
            {activity.firstCompletedAt
              ? `Since ${new Date(activity.firstCompletedAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`
              : "None yet"}
          </span>
        </div>
        <div className="stat">
          <span className="k">Upcoming</span>
          <span className="v num">{activity.upcoming}</span>
          <span className="s">
            {activity.nextUpcomingAt
              ? `Next on ${new Date(activity.nextUpcomingAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Addis_Ababa" })}`
              : "Nothing booked"}
          </span>
        </div>
        <div className="stat">
          <span className="k">Experts met</span>
          <span className="v num">{activity.expertsMet}</span>
          <span className="s">
            <Link href="/dashboard/sessions">See all sessions</Link>
          </span>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <section className="stack" style={{ gap: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 className="ws-h2">Experts you could book next</h2>
            <Link href="/experts" className="link-arrow">
              See all{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
          <div className="minis">
            {suggestions.map((expert) => (
              <Link key={expert.slug} href={`/experts/${expert.slug}`} className="mini">
                <span className="mini-ph" aria-hidden="true">
                  {expert.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, expires hourly.
                    <img src={expert.photoUrl} alt="" />
                  ) : (
                    initialsOf(expert.fullName)
                  )}
                </span>
                <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="d" style={{ fontSize: 17 }}>
                    {expert.fullName}
                  </span>
                  <span className="muted clamp2" style={{ fontSize: 14 }}>
                    {summaryLine(expert)}
                  </span>
                  {expert.startingPrice != null ? (
                    <span className="num" style={{ fontSize: 14, fontWeight: 500, color: "#2b4fe0" }}>
                      {formatEtb(expert.startingPrice)}
                      {expert.startingDurationMinutes ? ` · ${expert.startingDurationMinutes} min` : ""}
                    </span>
                  ) : null}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
