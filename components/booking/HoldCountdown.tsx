"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Server-authoritative countdown -- ticks locally from the booking's real
 * `hold_expires_at`, purely for display. The backend (hold_expires_at
 * itself, checked by every relevant RPC) is what actually enforces
 * expiry; this timer can never grant or extend anything on its own.
 */
export function HoldCountdown({ holdExpiresAt }: { holdExpiresAt: string }) {
  const target = new Date(holdExpiresAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const interval = setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => clearInterval(interval);
  }, [target]);

  if (remaining <= 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Your hold on this time has ended. Refresh to see its current status.
      </p>
    );
  }

  return (
    <p className="text-sm text-[var(--color-text)]">
      Your session time is being held for another{" "}
      <span className="font-semibold">{formatRemaining(remaining)}</span> while you correct the
      payment.
    </p>
  );
}
