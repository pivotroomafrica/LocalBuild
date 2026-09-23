import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export type ExpertCardData = {
  slug: string;
  fullName: string;
  headline: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
  photoUrl: string | null;
  categoryNames: string[];
  startingPrice: number | null;
};

function formatStartingPrice(amount: number | null): string | null {
  if (amount == null) return null;
  return `From ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount)} ETB`;
}

/**
 * The canonical marketplace atom (Phase 12 workstream C -- the
 * guideline's own "expert is the product" hierarchy: face, name,
 * credibility, what they help with, session terms, book). One component,
 * one set of real persisted fields -- /experts' grid and any other
 * future expert-listing surface both render this, never a bespoke card.
 *
 * 4:5 portrait per the guideline; a photo-less expert gets a plain
 * initial treatment (Satoshi on mist), never an invented portrait or a
 * generic silhouette icon. Session terms show only the real
 * starting-price the directory already computes -- never a fabricated
 * rate, review count, or ranking.
 *
 * CTA is "View profile" (architecture leads to the profile page, not
 * direct time selection) with the same-surface arrow_forward, never
 * "Learn more".
 */
export function ExpertCard({ expert }: { expert: ExpertCardData }) {
  const credibility = [expert.currentPosition, expert.currentCompany].filter(Boolean).join(" at ");
  const price = formatStartingPrice(expert.startingPrice);

  return (
    <Link
      href={`/experts/${expert.slug}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-text)]"
      style={{ transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-brand)" }}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--color-mist)]">
        {expert.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires hourly; next/image would cache a stale asset.
          <img
            src={expert.photoUrl}
            alt=""
            className="h-full w-full object-cover"
            width={400}
            height={500}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-display text-4xl font-bold text-[var(--color-text-muted)]">
              {expert.fullName.charAt(0)}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="font-display text-lg font-bold text-[var(--color-text)]">{expert.fullName}</p>
          {credibility ? <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{credibility}</p> : null}
        </div>

        {expert.headline ? (
          <p className="line-clamp-2 text-sm text-[var(--color-text-muted)]">{expert.headline}</p>
        ) : null}

        {expert.categoryNames.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {expert.categoryNames.slice(0, 3).map((name) => (
              <li
                key={name}
                className="rounded-[var(--radius-chip)] bg-[var(--color-mist)] px-2.5 py-1 text-xs text-[var(--color-text)]"
              >
                {name}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="tabular-nums-brand text-sm font-medium text-[var(--color-text)]">{price ?? ""}</span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-text)]">
            View profile
            <Icon name="arrow_forward" size={18} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
