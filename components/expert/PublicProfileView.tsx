import type { PublicProfileData } from "@/lib/public/data";
import { Icon } from "@/components/ui/Icon";
import { BookingRail } from "@/components/booking/BookingRail";
import type { RailBookingSnapshot } from "@/lib/booking/railData";
import type { CustomerProfile, Industry } from "@/types/profile";

/**
 * Shared presentation for a full expert profile -- used by both the
 * public /experts/[slug] page and the owner/admin-only
 * /expert/application/preview page (spec section 56: "reuse the SAME
 * presentation component as the eventual public profile"). Takes only
 * the normalized PublicProfileData shape, never a raw database row, so
 * it can never accidentally render a field (like the raw storage photo
 * path, or an admin/audit column) that was never meant to be public.
 *
 * Phase 12 workstream F: desktop split architecture (portrait/identity/
 * bio/expertise on the left, session terms + booking CTA in a sticky
 * right rail) with a mobile-first stacked order that still ends on the
 * booking CTA (guideline sections 37-38). The portrait uses the 4:5
 * rounded frame the guideline reserves for cards/profiles -- never the
 * circular chrome-only avatar shape. "Vetted by Pivotroom" is shown
 * because reaching this component at all already means profile_status =
 * 'published', which the Phase 3 application flow only ever reaches via
 * application_status = 'approved' -- a real, existing gate, not an
 * invented badge state.
 *
 * Phase 12 (critical architecture change): the right rail is no longer a
 * static "Session options" summary linking to a separate /book/[slug]
 * page -- it mounts BookingRail, the persistent, stateful booking
 * application itself (session/time selection through confirmation, all
 * in place, no navigation away from this profile). `railSnapshot` /
 * `railAuth` are omitted entirely on the owner/admin-only application
 * preview page (see that page's own call site) since booking oneself
 * isn't a real scenario there -- BookingRail treats a missing auth prop
 * set the same as a logged-out visitor, which is exactly correct for a
 * page that never has a real customer session backing it.
 */
export function PublicProfileView({
  profile,
  railAuth,
  railSnapshot,
}: {
  profile: PublicProfileData;
  railAuth?: {
    isLoggedIn: boolean;
    profileComplete: boolean;
    customerProfile: CustomerProfile | null;
    industries: Industry[];
  };
  railSnapshot?: RailBookingSnapshot | null;
}) {
  const formatLabel = [profile.onlineEnabled ? "Online" : null, profile.inPersonEnabled ? "In person" : null]
    .filter(Boolean)
    .join(" · ");
  const credibility = [profile.currentPosition, profile.currentCompany].filter(Boolean).join(" at ");
  const location = [profile.city, profile.country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
      <div className="flex flex-col gap-10 lg:flex-1 lg:min-w-0">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires hourly.
            <img
              src={profile.photoUrl}
              alt={profile.fullName}
              className="aspect-[4/5] w-32 shrink-0 rounded-[var(--radius-input)] object-cover sm:w-40"
            />
          ) : (
            <div className="flex aspect-[4/5] w-32 shrink-0 items-center justify-center rounded-[var(--radius-input)] bg-[var(--color-mist)] sm:w-40">
              <span className="font-display text-4xl font-bold text-[var(--color-text-muted)]">
                {profile.fullName.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="inline-flex w-fit items-center gap-1 rounded-full bg-[var(--color-accent-tint)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent)]">
              <Icon name="verified" size={18} decorative />
              Vetted by Pivotroom
            </div>
            <h1 className="font-display mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
              {profile.fullName}
            </h1>
            {profile.headline ? <p className="text-base text-[var(--color-text-muted)]">{profile.headline}</p> : null}
            {credibility ? <p className="text-sm text-[var(--color-text-muted)]">{credibility}</p> : null}
            {location ? <p className="text-sm text-[var(--color-text-muted)]">{location}</p> : null}
            {profile.linkedinUrl ? (
              <a
                href={profile.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium text-[var(--color-accent)] hover:underline"
              >
                LinkedIn
                <Icon name="arrow_outward" size={18} decorative />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </header>

        {profile.shortBio ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">About</h2>
            <p className="max-w-[65ch] whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
              {profile.shortBio}
            </p>
          </section>
        ) : null}

        {profile.expertiseSummary || profile.categoryNames.length > 0 ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">Expertise</h2>
            {profile.expertiseSummary ? (
              <p className="mb-3 max-w-[65ch] whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
                {profile.expertiseSummary}
              </p>
            ) : null}
            {profile.categoryNames.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {profile.categoryNames.map((name) => (
                  <li
                    key={name}
                    className="rounded-[var(--radius-chip)] border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text)]"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {profile.problemsHelpWith ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">What I can help with</h2>
            <p className="max-w-[65ch] whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
              {profile.problemsHelpWith}
            </p>
          </section>
        ) : null}

        {profile.whoIHelp ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">Who I help</h2>
            <p className="max-w-[65ch] whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
              {profile.whoIHelp}
            </p>
          </section>
        ) : null}

        {profile.careerHighlights ? (
          <section>
            <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">Career highlights</h2>
            <p className="max-w-[65ch] whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
              {profile.careerHighlights}
            </p>
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
        <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-[340px]">
          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">Session options</h2>
            {profile.sessionOfferings.length > 0 ? (
              <>
                <ul className="flex flex-col gap-2">
                  {profile.sessionOfferings.map((offering) => (
                    <li
                      key={offering.durationMinutes}
                      className="flex items-center justify-between rounded-[var(--radius-input)] bg-[var(--color-bg)] px-4 py-3 text-sm"
                    >
                      <span className="text-[var(--color-text)]">{offering.durationMinutes} min</span>
                      <span className="tabular-nums-brand font-medium text-[var(--color-text)]">
                        {offering.price.toLocaleString()} {offering.currency}
                      </span>
                    </li>
                  ))}
                </ul>
                {formatLabel ? (
                  <p className="mt-3 text-xs text-[var(--color-text-muted)]">Available: {formatLabel}</p>
                ) : null}
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  Prices shown are base session prices. Applicable government taxes will be
                  calculated separately.
                </p>
                <p className="mt-4 text-xs text-[var(--color-text-muted)]">
                  This is a preview of your public profile -- booking is only available on the
                  published page.
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">Session options are being finalized.</p>
            )}
          </section>
        </aside>
      )}
    </div>
  );
}
