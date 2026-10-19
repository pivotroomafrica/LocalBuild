import Link from "next/link";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { formatEtb, formatLine, initialsOf, summaryLine } from "@/components/site/format";

/**
 * Expert card from the website design: 4:5 photo (initials when there is
 * none), "Top expert" only when the expert has earned it (049c rule), the
 * real VAT-inclusive starting price and its session length.
 */
export function ExpertCard({ expert, showFormat = false }: { expert: PublicDirectoryCard; showFormat?: boolean }) {
  const format = showFormat ? formatLine(expert) : null;

  return (
    <Link href={`/experts/${expert.slug}`} className="xcard">
      <div className="pf">
        {expert.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, expires hourly.
          <img src={expert.photoUrl} alt="" loading="lazy" />
        ) : (
          <span className="initials" aria-hidden="true">
            {initialsOf(expert.fullName)}
          </span>
        )}
        {expert.stats.isTopExpert ? <span className="top-badge">Top expert</span> : null}
      </div>
      <div className="meta">
        <div className="nmrow">
          <span className="nm">{expert.fullName}</span>
          <span className="ms vt" role="img" aria-label="Vetted">
            verified
          </span>
        </div>
        {expert.startingPrice != null ? (
          <span className="price">
            {formatEtb(expert.startingPrice)}
            {expert.startingDurationMinutes ? ` · ${expert.startingDurationMinutes} min session` : ""}
          </span>
        ) : null}
        <span className="role">{summaryLine(expert)}</span>
        {format ? (
          <span className="fmt">
            <span className="ms" aria-hidden="true">
              {format.icon}
            </span>
            {format.label}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
