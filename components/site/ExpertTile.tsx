import Link from "next/link";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { ExpertPhoto } from "@/components/site/ExpertPhoto";
import { VerifiedIcon } from "@/components/site/icons";
import { formatEtb, summaryLine } from "@/components/site/format";

/** Homepage expert card. The whole card opens the real profile, where the
 * booking rail lives -- there is no separate quick-book form to drift out of
 * sync with real availability. No star rating: the schema has none. */
export function ExpertTile({ expert }: { expert: PublicDirectoryCard }) {
  return (
    <Link href={`/experts/${expert.slug}`} className="expert-card">
      <div className="expert-card-image-wrap">
        <ExpertPhoto photoUrl={expert.photoUrl} fullName={expert.fullName} className="expert-card-img" lazy />
        <span className="expert-card-badge badge-expert">Vetted</span>
        <div className="expert-card-overlay-btn">Book Session • View Info</div>
      </div>

      <div className="expert-card-body">
        <div className="expert-card-header">
          <div className="expert-name-wrap">
            <span className="expert-name">{expert.fullName}</span>
            <VerifiedIcon className="verified-icon" />
          </div>
        </div>

        <p className="expert-bio">{summaryLine(expert)}</p>

        <div className="expert-footer">
          <div>
            {expert.startingPrice != null ? (
              <>
                <span className="expert-price">From {formatEtb(expert.startingPrice)}</span>
                <span className="expert-price-suffix">• Session</span>
              </>
            ) : null}
          </div>
          <span className="expert-action-pill">Book &amp; Info →</span>
        </div>
      </div>
    </Link>
  );
}
