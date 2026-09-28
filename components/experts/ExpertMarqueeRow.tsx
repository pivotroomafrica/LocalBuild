"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExpertCard, type ExpertCardData } from "@/components/expert/ExpertCard";
import { Icon } from "@/components/ui/Icon";
import type { MarqueeDirection } from "@/lib/experts/chunk";

type Props = {
  experts: ExpertCardData[];
  direction: MarqueeDirection;
  /** Base speed in px/second -- rows pass a slightly different value to
   * each other for an organic, non-chaotic feel (spec section 13). */
  speedPxPerSecond: number;
  cardWidthClassName: string;
};

const RESUME_DELAY_MS = 3000; // within the requested 2-4s window
const DRAG_CLICK_THRESHOLD_PX = 6;
const MOBILE_BREAKPOINT_PX = 640;
const MOBILE_SPEED_MULTIPLIER = 0.7;

/**
 * ANIMATION only -- knows nothing about where experts come from (that's
 * MeetOurExperts) or how a single expert renders (that's ExpertCard).
 * Owns: the continuous auto-scroll, the seamless infinite loop, and every
 * manual-interaction affordance (wheel/trackpad/touch scroll natively,
 * mouse click-drag by hand, optional arrow buttons, hover/focus pause).
 *
 * Architecture: a real horizontally-scrollable element (`overflow-x:
 * auto`) is the single source of truth for position -- native wheel,
 * trackpad, and touch scrolling (with momentum) all work for free through
 * the browser's own scroll handling, satisfying nearly all of the manual-
 * interaction requirements with zero hand-rolled physics. A
 * requestAnimationFrame loop drives the SAME `scrollLeft` property for
 * the automatic motion, writing directly to the DOM via refs (never
 * React state per frame -- see the loop below), so this never causes a
 * re-render while animating. A single `scroll` event listener distin-
 * guishes "did I just write this?" from "did the user just move this?"
 * by comparing the live value against what the loop itself expected,
 * which is what lets auto-motion and manual scrolling share one
 * coordinate space without ever fighting or jumping.
 *
 * Seamless loop: N identical copies of the row's experts sit side by
 * side, each spanning `oneSetWidth`. scrollLeft is kept inside the
 * "safe" window [oneSetWidth, 2*oneSetWidth) at all times; whenever a
 * frame (or a user interaction) pushes it outside that window, it is
 * shifted by exactly one period (oneSetWidth) in the same direction --
 * since every period is pixel-identical, that shift is 100% invisible,
 * never a visible reset or snap. Enough copies are rendered so there is
 * always a full period of buffer on the low side and enough trailing
 * copies to cover the viewport on the high side, however wide the
 * viewport or however few real experts are in this particular row.
 */
export function ExpertMarqueeRow({ experts, direction, speedPxPerSecond, cardWidthClassName }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [copies, setCopies] = useState(() => Math.max(3, Math.ceil(24 / Math.max(experts.length, 1)) + 1));

  // ---- Mutable animation state (refs -- never trigger a re-render) ----
  const expectedScrollLeft = useRef(0);
  const oneSetWidth = useRef(0);
  const paused = useRef(false);
  const reducedMotion = useRef(false);
  const speedMultiplier = useRef(1);
  const rafId = useRef<number | null>(null);
  const lastTimestamp = useRef<number | null>(null);
  const resumeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mouse-only click-and-drag (touch already gets native scroll+momentum).
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const dragMoved = useRef(0);

  const [cursorGrabbing, setCursorGrabbing] = useState(false);

  const directionSign = direction === "left" ? 1 : -1;

  // Real cards keep stable, content-based keys; duplicated copies get a
  // copy-scoped key (never reused across copies) and are hidden from
  // assistive tech (spec section 6) since they are visual-only.
  const renderedCopies = useMemo(
    () => Array.from({ length: copies }, (_, copyIndex) => copyIndex),
    [copies],
  );

  function measureOneSetWidth(): number {
    const scroller = scrollerRef.current;
    if (!scroller || experts.length === 0) return 0;
    const children = scroller.children;
    if (children.length <= experts.length) return 0;
    const first = children[0] as HTMLElement;
    const secondCopyStart = children[experts.length] as HTMLElement;
    return secondCopyStart.getBoundingClientRect().left - first.getBoundingClientRect().left;
  }

  // Measure + (re)position on mount and on resize; grow `copies` if the
  // rendered content still isn't wide enough to buffer the current
  // viewport (very few experts in this row, or a very wide screen).
  useEffect(() => {
    const outer = outerRef.current;
    const scroller = scrollerRef.current;
    if (!outer || !scroller || experts.length === 0) return;

    function measureAndAdjust() {
      const width = measureOneSetWidth();
      if (width <= 0) return;
      oneSetWidth.current = width;

      const containerWidth = outer!.clientWidth;
      const neededCopies = Math.max(3, 2 + Math.ceil(containerWidth / width) + 1);
      if (neededCopies > copies) {
        setCopies(neededCopies);
        return; // re-measure after the next render with more copies
      }

      // Keep the current position inside the safe window whenever we
      // (re)anchor -- identical content on every period means this is
      // never visible, only ever a silent renumbering.
      if (expectedScrollLeft.current < width || expectedScrollLeft.current === 0) {
        expectedScrollLeft.current = width;
        scroller!.scrollLeft = width;
      }
    }

    measureAndAdjust();
    const resizeObserver = new ResizeObserver(() => measureAndAdjust());
    resizeObserver.observe(outer);
    return () => resizeObserver.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- experts identity is stable per row; copies is the thing this effect itself adjusts.
  }, [copies, experts.length]);

  // Reduced motion + mobile-speed detection -- re-checked on change/resize,
  // never per frame.
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => {
      reducedMotion.current = motionQuery.matches;
    };
    applyMotion();
    motionQuery.addEventListener("change", applyMotion);

    const applySpeed = () => {
      speedMultiplier.current = window.innerWidth < MOBILE_BREAKPOINT_PX ? MOBILE_SPEED_MULTIPLIER : 1;
    };
    applySpeed();
    window.addEventListener("resize", applySpeed);

    return () => {
      motionQuery.removeEventListener("change", applyMotion);
      window.removeEventListener("resize", applySpeed);
    };
  }, []);

  // The animation loop itself -- the only thing that runs every frame,
  // and it never calls setState.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || experts.length === 0) return;

    function tick(timestamp: number) {
      if (lastTimestamp.current === null) lastTimestamp.current = timestamp;
      const dtSeconds = Math.min(0.1, (timestamp - lastTimestamp.current) / 1000);
      lastTimestamp.current = timestamp;

      const width = oneSetWidth.current;
      if (width > 0 && !paused.current && !reducedMotion.current) {
        const delta = speedPxPerSecond * speedMultiplier.current * dtSeconds * directionSign;
        let next = expectedScrollLeft.current + delta;
        if (next >= 2 * width) next -= width;
        else if (next < width) next += width;
        expectedScrollLeft.current = next;
        scroller!.scrollLeft = next;
      }

      rafId.current = requestAnimationFrame(tick);
    }

    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      lastTimestamp.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- directionSign/speedPxPerSecond are stable per row instance.
  }, [experts.length]);

  function scheduleResume() {
    if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    resumeTimeout.current = setTimeout(() => {
      const scroller = scrollerRef.current;
      const width = oneSetWidth.current;
      if (scroller && width > 0) {
        // Renormalize into the safe window on resume -- silent (same
        // content, different number) and guarantees the loop always has
        // a full period of buffer in front of it again.
        const wrapped = width + (((scroller.scrollLeft - width) % width) + width) % width;
        expectedScrollLeft.current = wrapped;
        scroller.scrollLeft = wrapped;
      }
      paused.current = false;
    }, RESUME_DELAY_MS);
  }

  // One listener distinguishes "the loop wrote this" from "the user (or
  // a native scroll -- wheel, trackpad, touch, keyboard, an arrow-button
  // smooth-scroll) moved this" by comparing against what the loop itself
  // expected. Covers every manual-interaction path except mouse drag
  // (handled explicitly below, but drag also just mutates scrollLeft, so
  // it flows through this same detector too).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    function onScroll() {
      if (Math.abs(scroller!.scrollLeft - expectedScrollLeft.current) > 1) {
        expectedScrollLeft.current = scroller!.scrollLeft;
        paused.current = true;
        scheduleResume();
      }
    }

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  // Desktop hover: pause immediately (no grace delay -- this is a
  // continuous "is the pointer here" state, not a discrete released
  // gesture), resume immediately on leave. Keyboard focus gets the same
  // treatment so a tabbing keyboard user never fights the animation.
  function pauseForHover() {
    if (resumeTimeout.current) clearTimeout(resumeTimeout.current);
    paused.current = true;
  }
  function resumeFromHover() {
    if (!dragging.current) paused.current = false;
  }

  // ---- Mouse-only click-and-drag ----
  // Pointer capture is engaged LAZILY, only once real movement crosses
  // the drag threshold -- not on every mousedown. Capturing immediately
  // on press (even for a plain, zero-movement click) makes Chromium
  // retarget the matching mouseup/click to the capturing element instead
  // of the nested <Link> the user actually pressed, which silently
  // breaks ordinary card clicks. A click has no pointermove between down
  // and up, so it never reaches the capture call below and is completely
  // unaffected by any of this.
  const capturedPointerId = useRef<number | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return; // touch/pen use native scrolling untouched
    const scroller = scrollerRef.current;
    if (!scroller) return;
    dragging.current = true;
    dragMoved.current = 0;
    dragStartX.current = event.clientX;
    dragStartScrollLeft.current = scroller.scrollLeft;
    paused.current = true;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || event.pointerType !== "mouse") return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const deltaX = event.clientX - dragStartX.current;
    dragMoved.current = Math.max(dragMoved.current, Math.abs(deltaX));
    if (capturedPointerId.current === null && dragMoved.current > DRAG_CLICK_THRESHOLD_PX) {
      event.currentTarget.setPointerCapture(event.pointerId);
      capturedPointerId.current = event.pointerId;
      setCursorGrabbing(true);
    }
    scroller.scrollLeft = dragStartScrollLeft.current - deltaX;
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    if (capturedPointerId.current !== null) {
      event.currentTarget.releasePointerCapture(capturedPointerId.current);
      capturedPointerId.current = null;
    }
    dragging.current = false;
    setCursorGrabbing(false);
    scheduleResume();
  }

  // Prevent a drag from also registering as a card click (spec section
  // 30) -- runs in the capture phase so it beats the Link's own click
  // handler.
  function onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (dragMoved.current > DRAG_CLICK_THRESHOLD_PX) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragMoved.current = 0;
  }

  // Deliberately NOT `scroll-smooth` on the scroller itself (see its
  // className below) -- that CSS property would make the browser animate
  // EVERY direct `scrollLeft` assignment, including the rAF loop's own
  // per-frame writes and the drag handler's writes, fighting the
  // continuous motion instead of applying it instantly (the loop already
  // *is* the animation). `behavior: "smooth"` is requested explicitly
  // here instead, which only affects this one discrete scrollBy() call.
  function nudge(directionSignArg: 1 | -1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    paused.current = true;
    scroller.scrollBy({ left: directionSignArg * 320, behavior: "smooth" });
    scheduleResume();
  }

  if (experts.length === 0) return null;

  return (
    <div ref={outerRef} className="group/row relative">
      <div
        ref={scrollerRef}
        role="group"
        aria-label="Experts"
        className={`flex gap-4 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-5 [&::-webkit-scrollbar]:hidden ${
          cursorGrabbing ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0, black clamp(20px,5vw,64px), black calc(100% - clamp(20px,5vw,64px)), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black clamp(20px,5vw,64px), black calc(100% - clamp(20px,5vw,64px)), transparent 100%)",
        }}
        onPointerEnter={pauseForHover}
        onPointerLeave={(event) => {
          resumeFromHover();
          endDrag(event);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onFocusCapture={pauseForHover}
        onBlurCapture={() => scheduleResume()}
      >
        {renderedCopies.map((copyIndex) =>
          experts.map((expert) => (
            <div key={`${copyIndex}-${expert.slug}`} className={`shrink-0 ${cardWidthClassName}`}>
              <ExpertCard expert={expert} variant="marquee" decorative={copyIndex !== 0} />
            </div>
          )),
        )}
      </div>

      {/* Optional, subtle -- desktop only, hidden on touch-first viewports. */}
      <button
        type="button"
        aria-label="Scroll experts left"
        onClick={() => nudge(-1)}
        className="absolute left-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] opacity-0 shadow-sm transition-opacity duration-200 hover:bg-[var(--color-bg)] sm:flex group-hover/row:opacity-100"
      >
        <Icon name="chevron_left" size={20} decorative />
      </button>
      <button
        type="button"
        aria-label="Scroll experts right"
        onClick={() => nudge(1)}
        className="absolute right-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] opacity-0 shadow-sm transition-opacity duration-200 hover:bg-[var(--color-bg)] sm:flex group-hover/row:opacity-100"
      >
        <Icon name="chevron_right" size={20} decorative />
      </button>
    </div>
  );
}
