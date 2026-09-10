"use client";

import Link from "next/link";

/**
 * Route-scoped error boundary. Next.js requires this to be a Client
 * Component; it never renders the underlying error (`error.message`) --
 * that could be a raw Supabase/Postgres error -- only a safe, generic
 * message, consistent with every other error surface in this app never
 * showing a raw backend error.
 */
export default function ExpertAvailabilityError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <h1 className="text-lg font-semibold text-[var(--color-text)]">We couldn&apos;t load your availability</h1>
      <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
        Something went wrong loading this page. Please try again.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          Try again
        </button>
        <Link
          href="/expert/application"
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
        >
          Back to my application
        </Link>
      </div>
    </div>
  );
}
