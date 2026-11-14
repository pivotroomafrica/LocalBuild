"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Continue with LinkedIn" through Supabase Auth (LinkedIn OpenID
 * Connect), the same way as GoogleButton: LinkedIn sends them back to
 * /auth/callback, which signs them in and, for a new account, asks for
 * what LinkedIn doesn't give us (phone, country, city, terms).
 * Only rendered when the provider is switched on (lib/auth/providers.ts).
 */
export function LinkedInButton({ next, label = "Continue with LinkedIn" }: { next?: string; label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "linkedin_oidc",
      options: { redirectTo: callback.toString() },
    });
    // On success the browser is already leaving for LinkedIn.
    if (oauthError) {
      setPending(false);
      setError("LinkedIn sign-in isn't available right now. Please use another way to sign in.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-[var(--color-border)] bg-white px-5 text-[15px] font-semibold text-[var(--color-text)] transition-colors hover:border-[#0A66C2] hover:bg-[var(--color-mist)] disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <rect width="24" height="24" rx="4" fill="#0A66C2" />
          <path
            fill="#ffffff"
            d="M7.1 9.6h2.4V18H7.1V9.6Zm1.2-3.8a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM11 9.6h2.3v1.2h.03c.32-.6 1.1-1.24 2.27-1.24 2.43 0 2.88 1.6 2.88 3.68V18h-2.4v-4.2c0-1-.02-2.28-1.39-2.28-1.39 0-1.6 1.08-1.6 2.2V18H11V9.6Z"
          />
        </svg>
        {pending ? "Opening LinkedIn…" : label}
      </button>
      {error ? <p className="m-0 text-sm text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
