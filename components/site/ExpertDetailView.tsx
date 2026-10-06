import Link from "next/link";
import type { PublicProfileData } from "@/lib/public/data";
import type { RailBookingSnapshot } from "@/lib/booking/railData";
import type { CustomerProfile, Industry } from "@/types/profile";
import { BookingRail } from "@/components/booking/BookingRail";
import { ExpertPhoto } from "@/components/site/ExpertPhoto";
import { ArrowLeftIcon, VerifiedIcon } from "@/components/site/icons";
import { credibilityLine, formatEtb } from "@/components/site/format";

type Props = {
  profile: PublicProfileData;
  /** Omitted on the expert's own application preview: no booking rail
   * (booking yourself isn't a real scenario), a static session list
   * instead, and no sticky breadcrumb bar. */
  railAuth?: {
    isLoggedIn: boolean;
    profileComplete: boolean;
    customerProfile: CustomerProfile | null;
    industries: Industry[];
  };
  railSnapshot?: RailBookingSnapshot | null;
};

function StaticSessionOptions({ profile }: { profile: PublicProfileData }) {
  const formats = [profile.onlineEnabled ? "Online" : null, profile.inPersonEnabled ? "In person" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="booking-widget-card">
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-[var(--color-text)]">Session options</h2>
      {profile.sessionOfferings.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {profile.sessionOfferings.map((offering) => (
            <li
              key={offering.durationMinutes}
              className="flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm"
            >
              <span className="font-semibold text-[var(--color-text)]">{offering.durationMinutes} min</span>
              <span className="tabular-nums-brand font-bold text-[var(--color-text)]">{formatEtb(offering.price)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">No session options set yet.</p>
      )}
      {formats ? <p className="mt-3 text-xs text-[var(--color-text-muted)]">Available: {formats}</p> : null}
    </div>
  );
}

function SectionCard({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="detail-section-card">
      <h2 className="detail-card-title">
        <span>{title}</span>
      </h2>
      <div className="detail-bio-text whitespace-pre-wrap">{body}</div>
    </div>
  );
}

/**
 * Public expert profile (intro design). Left column renders only fields the
 * expert actually filled in -- no reviews, ratings, FAQs or "fast responder"
 * badges, because none of those exist in this schema. The right column is
 * the real BookingRail (live availability, holds, intake, Chapa / bank
 * payment); it brings its own mobile bottom bar + sheet, which is why the
 * site's mobile tab bar is hidden on this route (see SiteChrome).
 */
export function ExpertDetailView({ profile, railAuth, railSnapshot }: Props) {
  const credibility = credibilityLine(profile);
  const location = [profile.city, profile.country].filter(Boolean).join(", ");
  const cheapest = profile.sessionOfferings.reduce<(typeof profile.sessionOfferings)[number] | null>(
    (best, offering) => (!best || offering.price < best.price ? offering : best),
    null,
  );
  const primaryCategory = profile.categoryNames[0];

  return (
    <div className="expert-detail-page">
      {railAuth ? (
        <div className="detail-top-bar">
          <div className="detail-top-container">
            <Link href="/experts" className="back-link-btn">
              <ArrowLeftIcon width={15} height={15} />
              <span>All Experts</span>
              {primaryCategory ? (
                <>
                  <span className="text-gray-400">/</span>
                  <span className="text-[#6a6871]">{primaryCategory}</span>
                </>
              ) : null}
              <span className="text-gray-400">/</span>
              <span className="font-bold text-[#1a1921]">{profile.fullName}</span>
            </Link>

            {cheapest ? (
              <div className="hidden items-center gap-3 sm:flex">
                <div className="widget-trust-badge">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  Booking open
                </div>
                <span className="text-sm font-semibold text-[#1a1921]">
                  From {formatEtb(cheapest.price)} / {cheapest.durationMinutes}m
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="detail-main-layout">
        <div className="detail-left-col">
          <div className="detail-hero-card">
            <div className="detail-hero-top">
              <div className="detail-avatar-container">
                <ExpertPhoto photoUrl={profile.photoUrl} fullName={profile.fullName} className="detail-avatar" />
              </div>

              <div className="detail-hero-info">
                <div className="detail-name-row">
                  <h1 className="detail-expert-name">{profile.fullName}</h1>
                  <VerifiedIcon className="h-6 w-6" />
                </div>

                {profile.headline ? <p className="detail-headline">{profile.headline}</p> : null}
                {credibility ? <p className="text-sm text-[#6a6871]">{credibility}</p> : null}

                {profile.categoryNames.length > 0 ? (
                  <div className="detail-category-tags">
                    {profile.categoryNames.map((name) => (
                      <span key={name} className="detail-tag-chip">
                        {name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="detail-perks-bar">
              {profile.onlineEnabled ? (
                <div className="detail-perk-item">
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-indigo-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  <span>Online sessions</span>
                </div>
              ) : null}
              {profile.inPersonEnabled ? (
                <div className="detail-perk-item">
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-emerald-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>In-person sessions</span>
                </div>
              ) : null}
              {location ? (
                <div className="detail-perk-item">
                  <span>{location}</span>
                </div>
              ) : null}
              {profile.yearsExperienceLabel ? (
                <div className="detail-perk-item">
                  <span>{profile.yearsExperienceLabel} experience</span>
                </div>
              ) : null}
              {profile.linkedinUrl ? (
                <a
                  href={profile.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="detail-perk-item text-[#2563eb] hover:underline"
                >
                  LinkedIn ↗<span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : null}
            </div>
          </div>

          <SectionCard title={`About ${profile.fullName}`} body={profile.shortBio} />
          <SectionCard title="Expertise" body={profile.expertiseSummary} />
          <SectionCard title="What I can help you with" body={profile.problemsHelpWith} />
          <SectionCard title="Who I help" body={profile.whoIHelp} />
          <SectionCard title="Career highlights" body={profile.careerHighlights} />
        </div>

        <aside className="detail-right-col" id="booking-card">
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

          {railAuth ? (
            <div className="widget-guarantees-footer hidden lg:block">
              <div className="widget-guarantee-line">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-blue-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <span>Payment is verified before your session is confirmed.</span>
              </div>
              <div className="widget-guarantee-line">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-[#6a6871]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                <span>Request a reschedule or cancellation from your dashboard.</span>
              </div>
              <div className="widget-guarantee-line">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-indigo-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>Confirmation and session details are sent by email.</span>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
