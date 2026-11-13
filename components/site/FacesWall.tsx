import "./faces-wall.css";
import Link from "next/link";
import type { PublicDirectoryCard } from "@/lib/public/data";

/**
 * "You could keep reading. Or ask someone who's done it." -- a wall of
 * tiles around the headline, with a real published expert's photo in some
 * of them. Photos come straight from the live directory, so each new expert
 * fills the next box automatically; the rest stay as soft empty tiles.
 *
 * Desktop and phone get their own grids (not one squeezed grid). Boxes
 * nearest the headline fill first, alternating left and right, so a wall
 * with only a few experts still frames the text.
 */

type Layout = { cols: number; rows: number; hole: { c0: number; c1: number; r0: number; r1: number } };

/** Desktop: 20 x 8 with the middle 8 x 4 cleared for the text. */
const DESKTOP: Layout = { cols: 20, rows: 8, hole: { c0: 6, c1: 13, r0: 2, r1: 5 } };
/** Phone: 6 x 12 with a band of 6 rows cleared in the middle. */
const PHONE: Layout = { cols: 6, rows: 12, hole: { c0: 0, c1: 5, r0: 3, r1: 8 } };

const inHole = ({ cols, hole }: Layout, index: number) => {
  const c = index % cols;
  const r = Math.floor(index / cols);
  return c >= hole.c0 && c <= hole.c1 && r >= hole.r0 && r <= hole.r1;
};

/** Small fixed shuffle so the fill looks scattered but never changes. */
const jitter = (c: number, r: number) => ((c * 73 + r * 151) % 97) / 97;

/**
 * Cells outside the hole, best first: closest to the headline, the two
 * sides taking turns, with a little scatter so rows don't fill in lines.
 * Only every other-ish cell is offered, so the wall stays airy like a real
 * crowd rather than a solid block of faces.
 */
function slotOrder({ cols, rows, hole }: Layout): number[] {
  const cx = (hole.c0 + hole.c1) / 2;
  const cy = (hole.r0 + hole.r1) / 2;
  const cells: { index: number; score: number; sideA: boolean }[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const inHole = c >= hole.c0 && c <= hole.c1 && r >= hole.r0 && r <= hole.r1;
      if (inHole) continue;
      // Leave a checker-like rhythm of empty tiles between faces.
      if ((c + r * 2) % 3 === 1) continue;
      const dx = (c - cx) / (cols / 2);
      const dy = (r - cy) / (rows / 2);
      // Which side of the text this cell is on: left/right on a wide wall,
      // above/below on the phone's full-width band.
      const sideA = hole.c0 === 0 ? r < cy : c < cx;
      cells.push({ index: r * cols + c, score: Math.hypot(dx, dy) + jitter(c, r) * 0.35, sideA });
    }
  }
  // Nearest first on each side, the two sides taking turns, so faces frame
  // the text evenly however many there are.
  const a = cells.filter((cell) => cell.sideA).sort((x, y) => x.score - y.score);
  const b = cells.filter((cell) => !cell.sideA).sort((x, y) => x.score - y.score);
  const order: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i]) order.push(a[i].index);
    if (b[i]) order.push(b[i].index);
  }
  return order;
}

function Grid({ layout, experts, className }: { layout: Layout; experts: PublicDirectoryCard[]; className: string }) {
  const order = slotOrder(layout);
  const byCell = new Map<number, PublicDirectoryCard>();
  experts.slice(0, order.length).forEach((expert, i) => byCell.set(order[i], expert));
  const total = layout.cols * layout.rows;

  return (
    <div className={`fw-grid ${className}`} style={{ gridTemplateColumns: `repeat(${layout.cols}, var(--fw-tile))` }}>
      {Array.from({ length: total }, (_, index) => {
        const expert = byCell.get(index);
        if (!expert) {
          return <span key={index} className={inHole(layout, index) ? "fw-tile fw-void" : "fw-tile"} aria-hidden="true" />;
        }
        return (
          <Link
            key={index}
            href={`/experts/${expert.slug}`}
            className="fw-tile fw-face"
            aria-label={expert.fullName}
            title={expert.fullName}
            style={{ animationDelay: `${(order.indexOf(index) % 12) * 60}ms` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL. */}
            <img src={expert.photoUrl!} alt="" loading="lazy" />
          </Link>
        );
      })}
    </div>
  );
}

export function FacesWall({ experts }: { experts: PublicDirectoryCard[] }) {
  const withPhotos = experts.filter((expert) => expert.photoUrl);

  return (
    <section className="fw" aria-labelledby="fw-title">
      <Grid layout={DESKTOP} experts={withPhotos} className="fw-desktop" />
      <Grid layout={PHONE} experts={withPhotos} className="fw-phone" />

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
