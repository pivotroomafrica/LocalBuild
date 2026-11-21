"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Plays `count` steps one after another as the visitor scrolls.
 * Wide screens: the block pins (CSS, .wl-seq.seq-on) and the scroll
 * through it turns the steps on in turn. Phones: each element marked
 * data-index turns on as it comes into view. A step that has played stays
 * on. With reduced motion, or before the script runs, nothing is hidden.
 */
export function useScrollSteps(count: number) {
  const wrap = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [shown, setShown] = useState<boolean[]>(() => Array.from({ length: count }, () => false));

  useEffect(() => {
    const el = wrap.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const wide = window.matchMedia("(min-width: 901px)");
    let frame = 0;

    const fromScroll = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      // 0 when the block reaches its pinned spot, 1 when the pin releases.
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      const started = rect.top < window.innerHeight * 0.55;
      const on = started ? Math.min(count, 1 + Math.floor(progress * count)) : 0;
      setShown((prev) => {
        const next = prev.map((v, i) => v || i < on);
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
              setShown((prev) => (prev[index] ? prev : prev.map((v, i) => v || i === index)));
            }
          },
          { threshold: 0.45 },
        );
        el.querySelectorAll("[data-index]").forEach((node) => observer!.observe(node));
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
  }, [count]);

  return { wrap, enabled, shown };
}

/** The progress dots under a pinned sequence (wide screens only). */
export function seqStyle(count: number): React.CSSProperties {
  return { "--seq-steps": count } as React.CSSProperties;
}
