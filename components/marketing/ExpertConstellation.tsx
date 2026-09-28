"use client";

import { useEffect, useRef } from "react";

export type ConstellationExpert = {
  slug: string;
  fullName: string;
  photoUrl: string | null;
  categoryNames: string[];
};

type Slot = {
  top: string;
  left: string;
  size: number;
  opacity: number;
  blur: number;
  z: number;
  duration: string;
  delay: string;
  floatX: number;
  floatY: number;
  /** How far this portrait shifts on cursor parallax, relative to the
   * others -- the CLOSEST/largest portrait moves the most, distant ones
   * barely at all, which is what reads as depth (spec section 7). */
  parallaxDepth: number;
  /** Only the 1-2 largest, clearest slots ever carry a category label
   * (spec: "use labels sparingly") -- never every portrait. */
  showLabel?: boolean;
};

// A fixed, deliberately asymmetric composition -- six slots of decreasing
// prominence (size/opacity/blur/z), never a grid. With fewer than six real
// experts available, only the first N (highest-prominence) slots are used
// -- the composition gets sparser, not padded with invented people.
const SLOTS: Slot[] = [
  { top: "2%", left: "34%", size: 172, opacity: 1, blur: 0, z: 30, duration: "9s", delay: "0s", floatX: 10, floatY: -14, parallaxDepth: 1, showLabel: true },
  { top: "58%", left: "58%", size: 150, opacity: 1, blur: 0, z: 25, duration: "10.5s", delay: "2s", floatX: -10, floatY: -8, parallaxDepth: 0.85, showLabel: true },
  { top: "44%", left: "4%", size: 122, opacity: 0.92, blur: 0, z: 20, duration: "11s", delay: "1.1s", floatX: -8, floatY: 10, parallaxDepth: 0.6 },
  { top: "0%", left: "78%", size: 104, opacity: 0.8, blur: 0.5, z: 15, duration: "8.5s", delay: "0.6s", floatX: 8, floatY: 8, parallaxDepth: 0.4 },
  { top: "80%", left: "20%", size: 92, opacity: 0.72, blur: 0.5, z: 12, duration: "9.5s", delay: "1.6s", floatX: -6, floatY: 10, parallaxDepth: 0.3 },
  { top: "26%", left: "92%", size: 78, opacity: 0.6, blur: 1, z: 10, duration: "12s", delay: "0.3s", floatX: 6, floatY: 6, parallaxDepth: 0.2 },
];

const MAX_PARALLAX_PX = 10;

/**
 * The hero's "living ecosystem of real experts" (redesign spec section 7)
 * -- NOT a social-graph diagram (no connecting lines), just real portraits
 * in spatial composition, at different scale/opacity/blur for depth, each
 * drifting on its own slow CSS keyframe (see the pv-float animation in
 * globals.css, which also gets prefers-reduced-motion for free from this
 * app's existing global rule). Only real, published, photographed experts
 * ever appear here -- an expert without a photo is skipped rather than
 * shown as a placeholder initial (a floating letter-circle would read as
 * decoration, not as a person).
 *
 * The only JS behaviour is an optional, tiny cursor parallax: a ref-based
 * pointermove listener writes a CSS custom property directly onto each
 * portrait's own element (never React state, never per-frame re-renders),
 * capped at MAX_PARALLAX_PX and skipped entirely under
 * prefers-reduced-motion. Decorative to assistive tech -- the real
 * navigation into an expert's profile happens through ExpertCard/
 * MeetOurExperts, not through floating hero portraits.
 */
export function ExpertConstellation({ experts }: { experts: ConstellationExpert[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const portraitRefs = useRef<(HTMLDivElement | null)[]>([]);

  const withPhotos = experts.filter((expert) => expert.photoUrl).slice(0, SLOTS.length);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function onPointerMove(event: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = (event.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      const ny = (event.clientY - rect.top) / rect.height - 0.5;

      portraitRefs.current.forEach((el, index) => {
        if (!el) return;
        const depth = SLOTS[index]?.parallaxDepth ?? 0;
        el.style.setProperty("--parallax-x", `${nx * MAX_PARALLAX_PX * depth}px`);
        el.style.setProperty("--parallax-y", `${ny * MAX_PARALLAX_PX * depth}px`);
      });
    }

    function onPointerLeave() {
      portraitRefs.current.forEach((el) => {
        if (!el) return;
        el.style.setProperty("--parallax-x", "0px");
        el.style.setProperty("--parallax-y", "0px");
      });
    }

    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerleave", onPointerLeave);
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  if (withPhotos.length === 0) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="relative mx-auto h-[320px] w-full max-w-[440px] sm:h-[420px] sm:max-w-[520px] lg:h-[480px] lg:max-w-none"
    >
      {withPhotos.map((expert, index) => {
        const slot = SLOTS[index];
        const label = slot.showLabel ? expert.categoryNames[0] : null;
        return (
          <div
            key={expert.slug}
            ref={(el) => {
              portraitRefs.current[index] = el;
            }}
            className="absolute"
            style={{
              top: slot.top,
              left: slot.left,
              width: slot.size,
              height: slot.size * 1.25,
              zIndex: slot.z,
              opacity: slot.opacity,
              filter: slot.blur > 0 ? `blur(${slot.blur}px)` : undefined,
              transform: "translate3d(var(--parallax-x, 0px), var(--parallax-y, 0px), 0)",
              transition: "transform 300ms var(--ease-brand)",
            }}
          >
            <div
              className="h-full w-full overflow-hidden rounded-[14px] bg-[var(--color-mist)] shadow-[0_12px_32px_rgba(13,15,18,0.1)]"
              style={
                {
                  "--float-x": `${slot.floatX}px`,
                  "--float-y": `${slot.floatY}px`,
                  animation: `pv-float ${slot.duration} ease-in-out infinite`,
                  animationDelay: slot.delay,
                } as React.CSSProperties
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, expires hourly (same reasoning as ExpertCard). */}
              <img src={expert.photoUrl!} alt="" className="h-full w-full object-cover" draggable={false} />
            </div>
            {label ? (
              <span className="absolute -bottom-3 left-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-muted)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                {label}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
