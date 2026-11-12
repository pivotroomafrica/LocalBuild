"use client";

import { useMemo } from "react";

const COLORS = ["#2b4fe0", "#7a94f0", "#0d0f12", "#f2b705", "#ebeffd", "#047857"];

/** A one-off CSS confetti burst. Hidden for reduced motion (site.css). */
export function Confetti({ pieces = 60 }: { pieces?: number }) {
  // Deterministic spread (no Math.random during render).
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const spread = (i * 37) % 100;
        return {
          left: `${spread}%`,
          delay: `${(i % 12) * 40}ms`,
          duration: `${1400 + ((i * 53) % 900)}ms`,
          rotate: `${(i * 47) % 360}deg`,
          drift: `${((i * 29) % 120) - 60}px`,
          color: COLORS[i % COLORS.length],
          wide: i % 3 === 0,
        };
      }),
    [pieces],
  );
  return (
    <div className="ob-confetti" aria-hidden="true">
      {bits.map((bit, i) => (
        <span
          key={i}
          style={
            {
              left: bit.left,
              background: bit.color,
              animationDelay: bit.delay,
              animationDuration: bit.duration,
              width: bit.wide ? 10 : 6,
              "--r": bit.rotate,
              "--x": bit.drift,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
