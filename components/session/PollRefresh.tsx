"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page from the server every few seconds while a payment is
 * still being confirmed, so "waiting" turns into "confirmed" by itself. */
export function PollRefresh({ everyMs = 5000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
