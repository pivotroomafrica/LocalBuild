"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Defeats Next.js's browser back/forward Client Cache for one specific,
 * confirmed root cause of the "availability disappears after navigating
 * into the booking flow and back" bug.
 *
 * Per node_modules/next/dist/docs/01-app/04-glossary.md ("Client Cache"):
 * "Pages are not cached by default but ARE REUSED DURING BROWSER
 * BACK/FORWARD NAVIGATION." Per staleTimes.md: "This doesn't change
 * back/forward caching behavior" -- so neither `staleTimes` nor
 * `export const dynamic = "force-dynamic"` (a SERVER rendering-mode
 * directive, irrelevant to this CLIENT-side cache) can fix a stale
 * back-navigation. The one documented operation that explicitly busts it
 * is `router.refresh()` (use-router.md: "This clears the Client Cache for
 * the current route").
 *
 * This project does not enable Cache Components (`cacheComponents` is
 * unset in next.config.ts), so the App Router does not preserve mounted
 * component instances via React's <Activity> on navigation the way it
 * would with Cache Components enabled -- confirmed in
 * preserving-ui-state.md ("This guide assumes Cache Components is
 * enabled... Before Cache Components, preserving page-level state across
 * navigations required workarounds"). In this project's mode, a
 * back-navigation genuinely remounts the page's client component tree
 * from the (possibly stale) cached RSC payload, so this component's own
 * mount effect reliably fires every time this page becomes active again,
 * including via the browser's back button -- not just on the first,
 * fresh visit.
 */
export function RouterRefreshOnMount() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
