"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type FaceCard = { slug: string; fullName: string; photoUrl: string };
export type Layout = { cols: number; rows: number; hole: { c0: number; c1: number; r0: number; r1: number } };

const inHole = ({ cols, hole }: Layout, index: number) => {
  const c = index % cols;
  const r = Math.floor(index / cols);
  return c >= hole.c0 && c <= hole.c1 && r >= hole.r0 && r <= hole.r1;
};

/** Small fixed shuffle so the first fill looks scattered but is the same on
 * the server and in the browser (no jump on load). */
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
      if (c >= hole.c0 && c <= hole.c1 && r >= hole.r0 && r <= hole.r1) continue;
      if ((c + r * 2) % 3 === 1) continue;
      const dx = (c - cx) / (cols / 2);
      const dy = (r - cy) / (rows / 2);
      const sideA = hole.c0 === 0 ? r < cy : c < cx;
      cells.push({ index: r * cols + c, score: Math.hypot(dx, dy) + jitter(c, r) * 0.35, sideA });
    }
  }
  const a = cells.filter((cell) => cell.sideA).sort((x, y) => x.score - y.score);
  const b = cells.filter((cell) => !cell.sideA).sort((x, y) => x.score - y.score);
  const order: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i]) order.push(a[i].index);
    if (b[i]) order.push(b[i].index);
  }
  return order;
}

/** How often one face moves, and how long its fade-out takes. */
const STEP_MS = 2600;
const FADE_MS = 450;

/**
 * The wall of tiles. Starts exactly as the server drew it; then, while it's
 * on screen, one face at a time fades out and reappears in another free
 * box near the headline, so the wall gently reshuffles. Still for visitors
 * who prefer reduced motion.
 */
export function FacesGrid({ layout, experts, className }: { layout: Layout; experts: FaceCard[]; className: string }) {
  const order = slotOrder(layout);
  const shown = experts.slice(0, order.length);
  // Free boxes a face may move to: the nearest ones, so faces keep framing
  // the text rather than drifting to the far edges.
  const pool = order.slice(0, Math.min(order.length, Math.max(14, shown.length * 3)));

  const [cells, setCells] = useState<number[]>(() => shown.map((_, i) => order[i]));
  const { cols, hole } = layout;
  // Left/right of the text on a wide wall; above/below on the phone's band.
  const sideOf = (cell: number) =>
    hole.c0 === 0 ? Math.floor(cell / cols) < (hole.r0 + hole.r1) / 2 : cell % cols < (hole.c0 + hole.c1) / 2;
  const [leaving, setLeaving] = useState<number | null>(null);
  // Faces that have moved fade straight in (no first-load stagger).
  const [moved, setMoved] = useState<ReadonlySet<number>>(() => new Set());
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown.length === 0 || pool.length <= shown.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = false;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    if (gridRef.current) observer.observe(gridRef.current);

    let fadeTimer = 0;
    const timer = window.setInterval(() => {
      if (!visible || document.hidden) return;
      const who = Math.floor(Math.random() * shown.length);
      setLeaving(who);
      fadeTimer = window.setTimeout(() => {
        setCells((current) => {
          const taken = new Set(current);
          // Stay on the same side of the headline, so the wall stays balanced.
          const side = sideOf(current[who]);
          const free = pool.filter((cell) => !taken.has(cell) && sideOf(cell) === side);
          if (free.length === 0) return current;
          const next = [...current];
          next[who] = free[Math.floor(Math.random() * free.length)];
          return next;
        });
        setMoved((current) => (current.has(who) ? current : new Set(current).add(who)));
        setLeaving(null);
      }, FADE_MS);
    }, STEP_MS);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(fadeTimer);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for this wall
  }, []);

  const byCell = new Map<number, number>();
  cells.forEach((cell, i) => byCell.set(cell, i));
  const total = layout.cols * layout.rows;

  return (
    <div
      ref={gridRef}
      className={`fw-grid ${className}`}
      style={{ gridTemplateColumns: `repeat(${layout.cols}, var(--fw-tile))` }}
    >
      {Array.from({ length: total }, (_, index) => {
        const i = byCell.get(index);
        if (i === undefined) {
          return <span key={index} className={inHole(layout, index) ? "fw-tile fw-void" : "fw-tile"} aria-hidden="true" />;
        }
        const expert = shown[i];
        return (
          <Link
            // A new key per box, so moving to a new box plays the fade-in again.
            key={`${expert.slug}@${index}`}
            href={`/experts/${expert.slug}`}
            className={leaving === i ? "fw-tile fw-face fw-leaving" : "fw-tile fw-face"}
            aria-label={expert.fullName}
            title={expert.fullName}
            style={{ animationDelay: moved.has(i) ? "0ms" : `${(order.indexOf(index) % 12) * 60}ms` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL. */}
            <img src={expert.photoUrl} alt="" loading="lazy" />
          </Link>
        );
      })}
    </div>
  );
}
