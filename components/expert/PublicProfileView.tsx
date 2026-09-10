import Link from "next/link";
import type { PublicProfileData } from "@/lib/public/data";

/**
 * Shared presentation for a full expert profile -- used by both the
 * public /experts/[slug] page and the owner/admin-only
 * /expert/application/preview page (spec section 56: "reuse the SAME
 * presentation component as the eventual public profile"). Takes only
 * the normalized PublicProfileData shape, never a raw database row, so
 * it can never accidentally render a field (like the raw storage photo
 * path, or an admin/audit column) that was never meant to be public.
 *
 * "Book a Session" (Phase 5, spec section 7) links to /book/[slug]
 * whenever the expert has at least one active session offering -- that
 * route independently re-derives real availability and shows its own
 * "No availability right now" state if none exists, so this component
 * never needs to know the expert's actual open times, only whether
 * booking is worth offering at all. On the owner-only preview page this
 * link is harmless even before publication: /book/[slug] resolves
 * through the same published-only check as the rest of the public data
 * layer, so an unpublished profile's own preview simply shows "not
 * available" if followed.
 */
export function PublicProfileView({ profile }: { profile: PublicProfileData }) {
  const formatLabel = [profile.onlineEnabled ? "Online" : null, profile.inPersonEnabled ? "In Person" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        {profile.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photoUrl}
            alt={profile.fullName}
            className="h-28 w-28 shrink-0 rounded-full object-cover sm:h-32 sm:w-32"
          />
        ) : (
          <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-2xl font-semibold text-[var(--color-text-muted)] sm:h-32 sm:w-32">
            {profile.fullName.charAt(0)}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
            {profile.fullName}
          </h1>
          {profile.headline ? <p className="text-base text-[var(--color-text-muted)]">{profile.headline}</p> : null}
          <p className="text-sm text-[var(--color-text-muted)]">
            {[profile.currentPosition, profile.currentCompany].filter(Boolean).join(" at ")}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            {[profile.city, profile.country].filter(Boolean).join(", ")}
          </p>
          {profile.linkedinUrl ? (
            <a
              href={profile.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-sm font-medium text-[var(--color-brand)] hover:underline"
            >
              LinkedIn
            </a>
          ) : null}
        </div>
      </header>

      {profile.shortBio ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">About</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">{profile.shortBio}</p>
        </section>
      ) : null}

      {profile.expertiseSummary || profile.categoryNames.length > 0 ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">Expertise</h2>
          {profile.expertiseSummary ? (
            <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
              {profile.expertiseSummary}
            </p>
          ) : null}
          {profile.categoryNames.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {profile.categoryNames.map((name) => (
                <li
                  key={name}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text)]"
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
          <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">I Can Help With</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
            {profile.problemsHelpWith}
          </p>
        </section>
      ) : null}

      {profile.whoIHelp ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">Who I Help</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">{profile.whoIHelp}</p>
        </section>
      ) : null}

      {profile.careerHighlights ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-[var(--color-text)]">Career Highlights</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
            {profile.careerHighlights}
          </p>
        </section>
      ) : null}

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">Session Options</h2>
        {profile.sessionOfferings.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {profile.sessionOfferings.map((offering) => (
                <li
                  key={offering.durationMinutes}
                  className="flex items-center justify-between rounded-md bg-[var(--color-bg)] px-4 py-3 text-sm"
                >
                  <span className="text-[var(--color-text)]">{offering.durationMinutes} minutes</span>
                  <span className="font-medium text-[var(--color-text)]">
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
            <Link
              href={`/book/${profile.slug}`}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
            >
              Book a Session
            </Link>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Session options are being finalized.</p>
        )}
      </section>
    </div>
  );
}
