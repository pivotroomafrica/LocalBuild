"use client";

import { useEffect, useRef, useState } from "react";

export type Pair = { icon: string; problem: string; problemText: string; fix: string; fixText: string };

/**
 * Problem -> Pivotroom cards that play one after another as you scroll.
 * Wide screens: the row pins while you scroll and the cards play in turn
 * (1, then 2, then 3). Phones (stacked): each plays as it comes into view.
 * In each card the problem appears, the arrow drops, then the answer.
 * Without JavaScript, or with reduced motion, all cards simply show.
 */
export function PairSequence({ pairs }: { pairs: Pair[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [shown, setShown] = useState<boolean[]>(() => pairs.map(() => false));

  useEffect(() => {
    const el = wrap.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const wide = window.matchMedia("(min-width: 901px)");
    let frame = 0;

    const fromScroll = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      // 0 when the row reaches its pinned spot, 1 when the pin releases.
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      const started = rect.top < window.innerHeight * 0.55;
      const count = started ? Math.min(pairs.length, 1 + Math.floor(progress * pairs.length)) : 0;
      setShown((prev) => {
        // Once shown, a card stays shown (no flicker scrolling back up).
        const next = prev.map((on, i) => on || i < count);
        return next.every((v, i) => v === prev[i]) ? prev : next;
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(fromScroll);
    };

    let observer: IntersectionObserver | null = null;
    const setup = () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      if (wide.matches) {
        window.addEventListener("scroll", onScroll, { passive: true });
        fromScroll();
      } else {
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const index = Number((entry.target as HTMLElement).dataset.index);
              setShown((prev) => (prev[index] ? prev : prev.map((on, i) => on || i === index)));
            }
          },
          { threshold: 0.45 },
        );
        el.querySelectorAll("[data-index]").forEach((card) => observer!.observe(card));
      }
    };
    queueMicrotask(() => setEnabled(true));
    setup();
    wide.addEventListener("change", setup);
    return () => {
      window.removeEventListener("scroll", onScroll);
      wide.removeEventListener("change", setup);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pairs.length]);

  return (
    <div ref={wrap} className={enabled ? "wl-seq seq-on" : "wl-seq"}>
      <div className="wl-seq-pin">
        <div className="wl-grid3 wl-pairs">
          {pairs.map((item, index) => (
            <div key={item.problem} className={shown[index] ? "wl-pair is-on" : "wl-pair"} data-index={index}>
              <div className="wl-pair-bad">
                <p className="wl-tag wl-tag-bad">
                  <span className="ms" aria-hidden="true">
                    close
                  </span>
                  Today
                </p>
                <h3>{item.problem}</h3>
                <p>{item.problemText}</p>
              </div>
              <div className="wl-pair-good">
                <p className="wl-tag wl-tag-good">
                  <span className="ms" aria-hidden="true">
                    check
                  </span>
                  With Pivotroom
                </p>
                <h3>{item.fix}</h3>
                <p>{item.fixText}</p>
              </div>
            </div>
          ))}
        </div>
        <ol className="wl-seq-dots" aria-hidden="true">
          {pairs.map((item, index) => (
            <li key={item.problem} className={shown[index] ? "on" : ""} />
          ))}
        </ol>
      </div>
    </div>
  );
}
