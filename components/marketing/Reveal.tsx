"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
};

/**
 * Shared "enters the viewport" primitive (redesign spec section 22): fade
 * + translate ~24px, once, choreographed via `delayMs` (a heading at 0ms,
 * its body at ~100ms, an accompanying UI element at ~150ms -- staggered by
 * the caller, not by this component guessing). One IntersectionObserver
 * per instance, disconnected after the first reveal -- never re-triggers,
 * never drives a per-frame state update. `prefers-reduced-motion` shows
 * content immediately with no observer at all.
 */
export function Reveal({ children, delayMs = 0, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No separate prefers-reduced-motion branch needed: the observer
    // still reveals the element (usually within the same frame if it's
    // already in view), and the global reduced-motion rule in
    // globals.css already collapses the transition to ~instant.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
      style={{ transitionTimingFunction: "var(--ease-brand)", transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
