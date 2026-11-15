"use client";

import { useEffect } from "react";

/**
 * Fades and lifts every `[data-reveal]` element on the page into view as it
 * scrolls in. An element can set `--d` (e.g. style={{ "--d": 2 }}) to stagger
 * after its siblings. Without JavaScript, or with reduced motion, everything
 * simply shows (see the `[data-reveal]` rules in app/site.css).
 */
export function RevealOnScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((item) => item.classList.add("is-in"));
      return;
    }
    root.classList.add("reveal-on");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      root.classList.remove("reveal-on");
    };
  }, []);

  return null;
}
