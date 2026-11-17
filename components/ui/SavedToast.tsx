"use client";

import { useEffect, useState } from "react";

/**
 * An animated "Saved" confirmation: a pill that slides up at the bottom of
 * the screen with a check that draws itself, then fades away. Shows once
 * each time it mounts (give it a new `key` to show it again). Screen
 * readers hear the message once via role="status".
 */
export function SavedToast({
  message = "Your changes are saved",
  durationMs = 3200,
}: {
  message?: string;
  durationMs?: number;
}) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), durationMs);
    const remove = window.setTimeout(() => setGone(true), durationMs + 400);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, [durationMs]);

  if (gone) return null;
  return (
    <div className={leaving ? "saved-toast leaving" : "saved-toast"} role="status" aria-live="polite">
      <svg className="saved-check" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" />
        <path d="M7 12.5l3.2 3.2L17 9" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
