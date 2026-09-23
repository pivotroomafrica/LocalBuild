import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Container } from "@/components/ui/Container";
import { MobileNav } from "@/components/layout/MobileNav";

const linkClasses = "text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]";

/**
 * Auth-aware public navigation (pre-next-phase repair, kept). Every truly
 * public page (/, /experts, /experts/[slug], /become-an-expert) renders
 * this via app/(public)/layout.tsx.
 *
 * This is a pure Server Component: it reads the session with
 * `supabase.auth.getUser()` (via cookies()) on every request, so it
 * always reflects the CURRENT request's auth state -- there is no
 * client-side placeholder to mismatch or flicker, and no stale client
 * state to fall out of sync with login/logout/refresh. Reading cookies()
 * here also opts the whole (public) route group out of static
 * prerendering.
 *
 * No role-switching UI: a dual-identity account (customer AND approved
 * expert) sees both "Dashboard" and "Expert dashboard" at once.
 *
 * Phase 12: real BrandLogo (was plain text), a Container instead of a
 * hand-rolled max-w wrapper, and a compact mobile header (logo + a
 * single menu control opening MobileNav) instead of squeezing the
 * desktop links inline (guideline section 20).
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

  const navLinks = [
    { href: "/experts", label: "Browse experts" },
    ...(user
      ? [
          { href: "/dashboard", label: "Dashboard" },
          ...(isApprovedExpert ? [{ href: "/expert/dashboard", label: "Expert dashboard" }] : []),
        ]
      : [{ href: "/become-an-expert", label: "Become an expert" }]),
  ];

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="Pivotroom home">
          <BrandLogo size={26} />
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className={linkClasses}>
              {link.label}
            </Link>
          ))}

          {user ? (
            <form action={signOutAction}>
              <button type="submit" className={linkClasses}>
                Log out
              </button>
            </form>
          ) : (
            <>
              <Link href="/auth/login" className={linkClasses}>
                Log in
              </Link>
              <Link
                href="/auth/signup"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--color-brand)] px-6 text-sm font-medium text-[var(--color-on-brand)] transition-colors hover:bg-[var(--color-brand-hover)]"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>

        <MobileNav navLinks={navLinks} isLoggedIn={Boolean(user)} />
      </Container>
    </header>
  );
}
