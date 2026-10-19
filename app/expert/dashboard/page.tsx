import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedExpertPage } from "@/lib/expert/auth";
import { getExpertOverview, payoutOf, profileCompleteness } from "@/lib/expert/overview";
import { formatEtb } from "@/components/site/format";
import { greeting, relativeDays, shortDate } from "@/lib/utils/greeting";

/**
 * Expert overview (website design). Everything comes from this expert's
 * own paid bookings and reviews -- never a held/awaiting_payment booking
 * (getExpertPaidBookings filters on expert_profile_id AND status).
 */
export default async function ExpertDashboardPage() {
  const supabase = await createClient();
  const { expertProfileId } = await requireApprovedExpertPage(supabase, "/expert/dashboard");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [overview, { data: profile }, { data: me }] = await Promise.all([
    getExpertOverview(supabase, expertProfileId),
    supabase
      .from("expert_profiles")
      .select(
        "profile_image_path, headline, short_bio, expertise_summary, problems_help_with, who_i_help, career_highlights, linkedin_url, languages, response_time, experience",
      )
      .eq("id", expertProfileId)
      .maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  const firstName = (me?.full_name ?? "").split(/\s+/)[0];
  const completeness = profile ? profileCompleteness(profile) : { pct: 0, next: null };
  const { next } = overview;
  const month = new Date().toLocaleDateString("en-GB", { month: "long", timeZone: "Africa/Addis_Ababa" });

  const subtitle = next
    ? `Your next session is ${relativeDays(next.start_at)}.`
    : "No sessions booked right now. Open more hours so clients can book you.";

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
        <section className="ov-next ink" aria-label="Next session" style={{ alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 6, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14, color: "#9ba1aa" }}>Next session · {relativeDays(next.start_at)}</span>
            <span className="d" style={{ fontSize: 24, lineHeight: 1.2 }}>
              {next.customerName}
              {next.customerRole ? ` · ${next.customerRole}` : ""}
            </span>
            <span className="num" style={{ color: "#7a94f0", fontWeight: 500 }}>
              {shortDate(next.start_at, next.expert_timezone)} · {next.duration_minutes} min ·{" "}
              {next.session_format === "online" ? "Google Meet" : "In person"}
            </span>
            {next.topic ? (
              <p style={{ margin: "6px 0 0", maxWidth: "62ch", color: "#c4c8ce" }}>&ldquo;{next.topic}&rdquo;</p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBlockStart: 14 }}>
              {next.calendar_meeting_url ? (
                <a href={next.calendar_meeting_url} target="_blank" rel="noopener noreferrer" className="btn btn-white md">
                  Join on Google Meet{" "}
                  <span className="ms ao" aria-hidden="true">
                    arrow_outward
                  </span>
                  <span className="sr">(opens in a new tab)</span>
                </a>
              ) : null}
              <Link href={`/expert/sessions/${next.booking_reference}`} className="btn btn-ghost-ink md even">
                Session details
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <div className="stats">
        <div className="stat">
          <span className="k">Earned in {month}</span>
          <span className="v num">{formatEtb(overview.earnedThisMonth)}</span>
          <span className="s">Your share, after the 20% commission</span>
        </div>
        <div className="stat">
          <span className="k">Sessions this month</span>
          <span className="v num">{overview.sessionsThisMonth}</span>
          <span className="s">{overview.upcomingThisMonth > 0 ? `${overview.upcomingThisMonth} still to come` : "None still to come"}</span>
        </div>
        <div className="stat">
          <span className="k">Rating</span>
          <span className="v num">{overview.ratingAvg != null ? overview.ratingAvg.toFixed(1) : "—"}</span>
          <span className="s">
            {overview.reviewCount > 0
              ? `From ${overview.reviewCount} ${overview.reviewCount === 1 ? "review" : "reviews"}`
              : "No reviews yet"}
          </span>
        </div>
        <div className="stat">
          <span className="k">Booked again</span>
          <span className="v num">{overview.bookedAgainPct != null ? `${overview.bookedAgainPct}%` : "—"}</span>
          <span className="s">
            {overview.distinctClients > 0 ? `Of ${overview.distinctClients} clients so far` : "Clients who came back"}
          </span>
        </div>
      </div>

      <div className="two">
        <section className="panel stack" style={{ gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBlockEnd: 8 }}>
            <h2 className="ws-h2">This week</h2>
            <Link href="/expert/sessions" className="link-arrow">
              See all{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
          {overview.thisWeek.length > 0 ? (
            <div className="rows">
              {overview.thisWeek.map((session) => (
                <Link key={session.id} href={`/expert/sessions/${session.booking_reference}`}>
                  <span className="muted num" style={{ fontSize: 14 }}>
                    {shortDate(session.start_at, session.expert_timezone)}
                  </span>
                  <span className="stack" style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{session.customerName}</span>
                    {session.topic ? (
                      <span className="muted" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {session.topic}
                      </span>
                    ) : null}
                  </span>
                  <span className="num" style={{ fontSize: 15, fontWeight: 500 }}>
                    {formatEtb(payoutOf(session))}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Nothing booked in the next seven days.
            </p>
          )}
        </section>

        <section className="panel stack" style={{ gap: 14 }}>
          <h2 className="ws-h2">Your profile</h2>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            Clients choose from what your profile says. The more specific it is, the better we can match you.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
            <span>Profile complete</span>
            <span className="num" style={{ fontWeight: 600 }}>
              {completeness.pct}%
            </span>
          </div>
          <div className="bar" aria-hidden="true">
            <span style={{ width: `${completeness.pct}%` }} />
          </div>
          {completeness.next ? (
            <Link href="/expert/application/profile" className="link-arrow" style={{ fontWeight: 400 }}>
              {completeness.next}{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          ) : null}
          <Link href="/expert/availability" className="btn btn-line md" style={{ alignSelf: "flex-start" }}>
            Open more hours{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </section>
      </div>
    </div>
  );
}
