"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

/**
 * "Continue with Google" through Supabase Auth. Google sends them back to
 * /auth/callback, which signs them in and, for a new account, asks for the
 * few things Google doesn't give us (phone, country, city, terms).
 *
 * `next` is where they land afterwards (e.g. the expert page they were
 * booking from).
 */
export function GoogleButton({ next, label = "Continue with Google" }: { next?: string; label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    // On success the browser is already leaving for Google.
    if (oauthError) {
      setPending(false);
      setError("Google sign-in isn't available right now. Please use your email instead.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-[var(--color-border)] bg-white px-5 text-[15px] font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-mist)] disabled:opacity-60"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
        </svg>
        {pending ? "Opening Google…" : label}
      </button>
      {error ? <p className="m-0 text-sm text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}

/** "or" divider plus the terms note shown under the Google button. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
      <span className="h-px flex-1 bg-[var(--color-border)]" />
      or
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}

export function GoogleTermsNote() {
  return (
    <p className="m-0 text-center text-xs text-[var(--color-text-muted)]">
      By continuing with Google or LinkedIn you agree to our{" "}
      <Link href="/terms" target="_blank" className="underline">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" target="_blank" className="underline">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
