import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";

const linkClasses = "text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]";

/**
 * Auth-aware public navigation (pre-next-phase repair). Every truly
 * public page (/, /experts, /experts/[slug], /become-an-expert) renders
 * this via app/(public)/layout.tsx.
 *
 * This is a pure Server Component: it reads the session with
 * `supabase.auth.getUser()` (via cookies()) on every request, so it
 * always reflects the CURRENT request's auth state -- there is no
 * client-side placeholder to mismatch or flicker, and no stale client
 * state to fall out of sync with login/logout/refresh. Reading cookies()
 * here also opts the whole (public) route group out of static
 * prerendering, which is what actually fixes the original bug: `/` was
 * previously a fully static page with zero auth awareness at all (it
 * always rendered the same build-time HTML to every visitor, logged in
 * or not) -- not a stale-client-state problem, a "this route never ran
 * per-request" problem.
 *
 * No role-switching UI: a dual-identity account (customer AND approved
 * expert) sees both "Dashboard" and "Expert Dashboard" at once.
 */
export async function PublicHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isApprovedExpert = false;
  if (user) {
    const { data: expertProfile } = await supabase
      .from("expert_profiles")
      .select("application_status")
      .eq("user_id", user.id)
      .maybeSingle();
    isApprovedExpert = expertProfile?.application_status === "approved";
  }

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
          Pivotroom
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/experts" className={linkClasses}>
            Find an Expert
          </Link>

          {user ? (
            <>
              <Link href="/dashboard" className={linkClasses}>
                Dashboard
              </Link>
              {isApprovedExpert ? (
                <Link href="/expert/dashboard" className={linkClasses}>
                  Expert Dashboard
                </Link>
              ) : null}
              <form action={signOutAction}>
                <button type="submit" className={linkClasses}>
                  Log Out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/auth/login" className={linkClasses}>
                Log In
              </Link>
              <Link
                href="/auth/signup"
                className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
              >
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
