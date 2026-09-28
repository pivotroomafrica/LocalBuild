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

export type ExpertCardVariant = "browse" | "marquee";

type Props = {
  expert: ExpertCardData;
  /**
   * "browse" (default): the original /experts grid card -- unchanged.
   * "marquee": the "Meet Our Experts" homepage row card -- more
   * image-forward, denser, sized by its parent (ExpertMarqueeRow controls
   * width per breakpoint; this component only controls internal layout/
   * information density, never its own outer width -- see that
   * component's own comment on why sizing is a context concern, not a
   * card concern).
   */
  variant?: ExpertCardVariant;
  /** Marquee only: a11y -- a visually-duplicated copy of a real card
   * (rendered again for the seamless loop) is hidden from assistive tech
   * so duplicated names are never announced twice. */
  decorative?: boolean;
  className?: string;
};

/**
 * The canonical marketplace atom (Phase 12 workstream C, extended for the
 * "Meet Our Experts" homepage marquee -- the guideline's own "expert is
 * the product" hierarchy: face, name, credibility, what they help with,
 * session terms, book). One component, one set of real persisted fields
 * -- /experts' grid, the homepage marquee, and any future expert-listing
 * surface all render this, never a bespoke per-page card. DATA (this
 * component's props) is intentionally decoupled from PRESENTATION
 * (variant-driven layout, below) and from ANIMATION (owned entirely by
 * ExpertMarqueeRow -- this component has no idea it's ever inside a
 * moving row).
 *
 * 4:5 portrait per the guideline; a photo-less expert gets a plain
 * initial treatment (Satoshi on mist), never an invented portrait or a
 * generic silhouette icon. Session terms show only the real
 * starting-price the directory already computes -- never a fabricated
 * rate, review count, or ranking.
 *
 * CTA is "View profile" (browse variant only; architecture leads to the
 * profile page, not direct time selection) with the same-surface
 * arrow_forward, never "Learn more". The marquee variant drops the CTA
 * row entirely (spec: "keep it scannable," the whole card is already the
 * click target) and shows a compact "Verified" badge instead of the
 * browse variant's footer affordance.
 */
export function ExpertCard({ expert, variant = "browse", decorative = false, className = "" }: Props) {
  const credibility = [expert.currentPosition, expert.currentCompany].filter(Boolean).join(" at ");
  const price = formatStartingPrice(expert.startingPrice);

  if (variant === "marquee") {
    return (
      <Link
        href={`/experts/${expert.slug}`}
        aria-hidden={decorative || undefined}
        tabIndex={decorative ? -1 : undefined}
        className={`group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] transition-[border-color,transform] hover:border-[var(--color-text)] ${className}`}
        style={{ transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-brand)" }}
        draggable={false}
      >
        <div className="relative aspect-[4/5] w-full shrink-0 overflow-hidden bg-[var(--color-mist)]">
          {expert.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires hourly; next/image would cache a stale asset (same reasoning as the browse variant below).
            <img
              src={expert.photoUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              width={320}
              height={400}
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-display text-3xl font-bold text-[var(--color-text-muted)]">
                {expert.fullName.charAt(0)}
              </span>
            </div>
          )}
          <div className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)]/90 px-2 py-1 text-[11px] font-medium text-[var(--color-text)] backdrop-blur-sm">
            <Icon name="verified" size={18} className="text-[var(--color-accent)]" decorative />
            Verified
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1 p-3.5">
          <p className="line-clamp-2 font-display text-sm font-bold leading-tight text-[var(--color-text)]">
            {expert.fullName}
          </p>
          {credibility ? (
            <p className="line-clamp-2 text-xs leading-snug text-[var(--color-text-muted)]">{credibility}</p>
          ) : null}
          {expert.categoryNames.length > 0 ? (
            <p className="line-clamp-1 text-xs text-[var(--color-text-muted)]">
              {expert.categoryNames.slice(0, 3).join(" · ")}
            </p>
          ) : null}
          <span className="tabular-nums-brand mt-auto pt-2 text-xs font-medium text-[var(--color-text)]">
            {price ?? ""}
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/experts/${expert.slug}`}
      className={`group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-text)] ${className}`}
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
