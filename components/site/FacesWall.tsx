import "./faces-wall.css";
import Link from "next/link";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { FacesGrid, type FaceCard, type Layout } from "@/components/site/FacesGrid";

/**
 * "You could keep reading. Or ask someone who's done it." -- a wall of
 * tiles around the headline, with a real published expert's photo in some
 * of them. Photos come straight from the live directory, so each new expert
 * fills the next box automatically; the rest stay as soft empty tiles.
 *
 * Desktop and phone get their own grids (not one squeezed grid). Boxes
 * nearest the headline fill first, alternating left and right, so a wall
 * with only a few experts still frames the text; then faces gently swap
 * boxes while the wall is on screen (FacesGrid).
 */

/** Desktop: 20 x 8 with the middle 8 x 4 cleared for the text. */
const DESKTOP: Layout = { cols: 20, rows: 8, hole: { c0: 6, c1: 13, r0: 2, r1: 5 } };
/** Phone: 6 x 12 with a band of 6 rows cleared in the middle. */
const PHONE: Layout = { cols: 6, rows: 12, hole: { c0: 0, c1: 5, r0: 3, r1: 8 } };

export function FacesWall({ experts }: { experts: PublicDirectoryCard[] }) {
  const withPhotos: FaceCard[] = experts
    .filter((expert) => expert.photoUrl)
    .map((expert) => ({ slug: expert.slug, fullName: expert.fullName, photoUrl: expert.photoUrl! }));

  return (
    <section className="fw" aria-labelledby="fw-title">
      <FacesGrid layout={DESKTOP} experts={withPhotos} className="fw-desktop" />
      <FacesGrid layout={PHONE} experts={withPhotos} className="fw-phone" />

      <div className="fw-copy">
        <h2 id="fw-title" className="fw-title">
          You could keep reading. <em>Or ask someone who&apos;s done it.</em>
        </h2>
        <p className="fw-sub">
          Everyone here has already solved the problem you&apos;re stuck on. One honest conversation with them beats
          another week of guessing.
        </p>
        <Link href="/experts" className="btn btn-ink lg">
          Find your expert{" "}
          <span className="ms af" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </div>
    </section>
  );
}
