import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function BecomeAnExpertPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts protects everything under /expert, so this link is safe to
  // point there directly even for a logged-out visitor -- they'll be sent
  // to /auth/login?next=/expert/application and land back here afterward.
  const applyHref = user
    ? "/expert/application"
    : `/auth/signup?next=${encodeURIComponent("/expert/application")}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-4 py-20 text-center">
      <p className="text-sm font-medium tracking-wide text-[var(--color-brand)]">
        BECOME AN EXPERT
      </p>
      <h1 className="mt-4 max-w-lg text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">
        Share your experience through paid one-to-one sessions.
      </h1>
      <p className="mt-4 max-w-md text-base text-[var(--color-text-muted)]">
        Apply to join Pivotroom as an expert. Tell us about your background, set the
        consultation offerings you&apos;d like to provide, and submit your application for
        review.
      </p>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Link
          href={applyHref}
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          Apply to Become an Expert
        </Link>
        {!user ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Already have a Pivotroom account?{" "}
            <Link
              href={`/auth/login?next=${encodeURIComponent("/expert/application")}`}
              className="font-medium text-[var(--color-brand)] hover:underline"
            >
              Log in
            </Link>
          </p>
        ) : null}
      </div>

      <p className="mt-10 max-w-md text-xs text-[var(--color-text-muted)]">
        Applying does not make you a public expert. Your application is reviewed before
        anything about you appears on Pivotroom.
      </p>
    </div>
  );
}
