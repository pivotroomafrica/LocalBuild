import Link from "next/link";
import { RESPONSE_TIME_LABELS, type PublicProfileData, type PublicReview } from "@/lib/public/data";
import type { RailBookingSnapshot } from "@/lib/booking/railData";
import type { CustomerProfile, Industry } from "@/types/profile";
import { BookingRail } from "@/components/booking/BookingRail";
import { formatEtb, formatLine, initialsOf } from "@/components/site/format";

type Props = {
  profile: PublicProfileData;
  /** Omitted on the expert's own application preview: no booking rail
   * (booking yourself isn't a real scenario), a static session list
   * instead. */
  railAuth?: {
    isLoggedIn: boolean;
    profileComplete: boolean;
    customerProfile: CustomerProfile | null;
    industries: Industry[];
  };
  railSnapshot?: RailBookingSnapshot | null;
};

function StaticSessionOptions({ profile }: { profile: PublicProfileData }) {
  return (
    <div className="bookaside" style={{ display: "block" }}>
      <div className="bookcard">
        <h2 className="d" style={{ margin: 0, fontSize: 20 }}>
          Session options
        </h2>
        {profile.sessionOfferings.length > 0 ? (
          <div className="opt-grid c3">
            {profile.sessionOfferings.map((offering) => (
              <span key={offering.durationMinutes} className="chip tall" style={{ cursor: "default" }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{offering.durationMinutes} min</span>
                <span className="sub">{formatEtb(offering.price)}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No session options set yet.
          </p>
        )}
        <span className="muted" style={{ fontSize: 13 }}>
          Prices include VAT. This is a preview: booking opens once your profile is published.
        </span>
      </div>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" role="img" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className={n <= rating ? undefined : "off"}>
          <path
            fill="currentColor"
            d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        </svg>
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <figure className="review">
      <Stars rating={review.rating} />
      <blockquote>{review.body}</blockquote>
      <figcaption>
        <span className="av" aria-hidden="true">
          {initialsOf(review.reviewerName)}
        </span>
        <span className="stack" style={{ lineHeight: 1.35 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{review.reviewerName}</span>
          <span className="muted" style={{ fontSize: 14 }}>
            {review.durationMinutes} min ·{" "}
            {new Date(review.createdAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Public expert profile (website design). Only what the expert actually
 * filled in is shown, plus real activity: reviews from completed sessions
 * and the "Top expert" badge when earned (049c). The right column is the
 * real BookingRail (live availability, holds, intake, Chapa / bank
 * payment); below 1040px it becomes a bottom bar and sheet.
 */
export function ExpertDetailView({ profile, railAuth, railSnapshot }: Props) {
  const firstName = profile.fullName.split(/\s+/)[0] || profile.fullName;
  const role = [profile.currentPosition, profile.currentCompany].filter(Boolean).join(", ");
  const location = [profile.city, profile.country].filter(Boolean).join(", ");
  const format = formatLine(profile);
  const { stats } = profile;

  return (
    <div className="wrap profile">
      {railAuth ? (
        <Link href="/experts" className="link-arrow" style={{ alignSelf: "flex-start", fontWeight: 400 }}>
          <span className="ms flip" aria-hidden="true">
            arrow_forward
          </span>{" "}
          All experts
        </Link>
      ) : null}

      <div className="profile-cols">
        <div className="profile-main">
          <div className="profile-top">
            <div className="profile-photo">
              {profile.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, expires hourly.
                <img src={profile.photoUrl} alt={profile.fullName} />
              ) : (
                <span className="initials" aria-hidden="true">
                  {initialsOf(profile.fullName)}
                </span>
              )}
            </div>
            <div className="profile-id">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <span className="pill-blue">
                  <span className="ms" aria-hidden="true">
                    verified
                  </span>
                  Vetted expert
                </span>
                {stats.isTopExpert ? (
                  <span className="pill-blue" style={{ background: "#0d0f12", color: "#ffffff" }}>
                    <span className="ms" aria-hidden="true">
                      workspace_premium
                    </span>
                    Top expert
                  </span>
                ) : null}
              </div>
              <h1 className="h1">{profile.fullName}</h1>
              {role || profile.headline ? (
                <p className="role">
                  {role}
                  {role && profile.headline ? <br /> : null}
                  {profile.headline}
                </p>
              ) : null}
              <div className="facts">
                {format ? (
                  <span>
                    <span className="ms" aria-hidden="true">
                      {format.icon}
                    </span>
                    {format.label}
                  </span>
                ) : null}
                {profile.languages.length > 0 ? (
                  <span>
                    <span className="ms" aria-hidden="true">
                      chat_bubble
                    </span>
                    {profile.languages.join(", ")}
                  </span>
                ) : null}
                {profile.responseTime ? (
                  <span>
                    <span className="ms" aria-hidden="true">
                      schedule
                    </span>
                    {RESPONSE_TIME_LABELS[profile.responseTime]}
                  </span>
                ) : null}
                {location ? (
                  <span>
                    <span className="ms" aria-hidden="true">
                      location_on
                    </span>
                    {location}
                  </span>
                ) : null}
                {stats.sessionsCompleted > 0 ? (
                  <span className="num">
                    <span className="ms" aria-hidden="true">
                      task_alt
                    </span>
                    {stats.sessionsCompleted} {stats.sessionsCompleted === 1 ? "session" : "sessions"} completed
                  </span>
                ) : null}
                {profile.linkedinUrl ? (
                  <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow">
                    LinkedIn
                    <span className="ms ao" aria-hidden="true">
                      arrow_outward
                    </span>
                    <span className="sr">(opens in a new tab)</span>
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          {profile.shortBio || profile.whoIHelp ? (
            <section className="psec">
              <h2 className="h3">About</h2>
              {profile.shortBio ? <p>{profile.shortBio}</p> : null}
              {profile.whoIHelp ? <p>{profile.whoIHelp}</p> : null}
            </section>
          ) : null}

          {profile.categoryNames.length > 0 || profile.problemsHelpWith ? (
            <section className="psec">
              <h2 className="h3">Ask {firstName} about</h2>
              {profile.categoryNames.length > 0 ? (
                <ul className="tags">
                  {profile.categoryNames.map((name) => (
                    <li key={name} className="tag">
                      {name}
                    </li>
                  ))}
                </ul>
              ) : null}
              {profile.problemsHelpWith ? <p>{profile.problemsHelpWith}</p> : null}
            </section>
          ) : null}

          {profile.expertiseSummary ? (
            <section className="psec">
              <h2 className="h3">Expertise</h2>
              <p>{profile.expertiseSummary}</p>
            </section>
          ) : null}

          {profile.experience.length > 0 || profile.careerHighlights ? (
            <section className="psec" style={{ gap: 8 }}>
              <h2 className="h3" style={{ marginBlockEnd: 8 }}>
                Experience
              </h2>
              {profile.experience.map((entry, index) => (
                <div key={`${entry.startYear}-${index}`} className="xp-row">
                  <span className="yrs">
                    {entry.startYear} – {entry.endYear ?? "now"}
                  </span>
                  <div className="what">
                    <span style={{ fontWeight: 500 }}>{entry.title}</span>
                    {entry.organization ? (
                      <span className="muted" style={{ fontSize: 15 }}>
                        {entry.organization}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              {profile.careerHighlights ? (
                <p style={{ paddingBlockStart: profile.experience.length > 0 ? 16 : 0 }}>{profile.careerHighlights}</p>
              ) : null}
            </section>
          ) : null}

          {profile.reviews.length > 0 ? (
            <section className="psec" style={{ gap: 24 }}>
              <div className="stack" style={{ gap: 8 }}>
                <h2 className="h3">After the session</h2>
                {stats.ratingAvg != null ? (
                  <span className="muted num" style={{ fontSize: 15 }}>
                    {stats.ratingAvg.toFixed(1)} out of 5 from {stats.reviewCount}{" "}
                    {stats.reviewCount === 1 ? "review" : "reviews"}
                  </span>
                ) : null}
              </div>
              <div className="reviews">
                {profile.reviews.map((review) => (
                  <ReviewCard key={`${review.createdAt}-${review.reviewerName}`} review={review} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {railAuth ? (
          <BookingRail
            expertSlug={profile.slug}
            expertName={profile.fullName}
            sessionOfferings={profile.sessionOfferings}
            onlineEnabled={profile.onlineEnabled}
            inPersonEnabled={profile.inPersonEnabled}
            isLoggedIn={railAuth.isLoggedIn}
            profileComplete={railAuth.profileComplete}
            customerProfile={railAuth.customerProfile}
            industries={railAuth.industries}
            snapshot={railSnapshot ?? null}
          />
        ) : (
          <StaticSessionOptions profile={profile} />
        )}
      </div>
    </div>
  );
}
