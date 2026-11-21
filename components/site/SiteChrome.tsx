"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { SignOutIconButton } from "@/components/site/SignOutIconButton";
import { MobileMenu, MobileTabBar } from "@/components/site/MobileNav";
import { MegaNav } from "@/components/site/MegaNav";
import { siteNav } from "@/lib/site/nav";
import { BrandLogo } from "@/components/ui/BrandLogo";

type Props = {
  isLoggedIn: boolean;
  isApprovedExpert: boolean;
  isAdmin: boolean;
};

/** The primary wordmark (brand guidelines v1.0): ink on light, white on ink.
 * The surrounding link carries the accessible name. */
export function SiteLogo({
  tone = "ink",
  label = "",
  compact = false,
}: {
  tone?: "ink" | "white";
  label?: string;
  /** Smaller, for tight bars (the phone menu). */
  compact?: boolean;
}) {
  return (
    <BrandLogo
      size={26}
      label={label}
      className={compact ? "site-logo compact" : "site-logo"}
      style={{ color: tone === "ink" ? "#0D0F12" : "#FFFFFF", alignSelf: "flex-start" }}
    />
  );
}

/** The round account button and its menu (also used in the dashboards' header). */
export function AccountMenu({ isApprovedExpert, isAdmin }: { isApprovedExpert: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="avatar"
        aria-label="Your account"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ms" aria-hidden="true">
          person
        </span>
      </button>
      {open ? (
        <div className="menu-panel">
          {isAdmin ? (
            <Link href="/admin" onClick={() => setOpen(false)}>
              Admin dashboard
            </Link>
          ) : null}
          {isApprovedExpert ? (
            <Link href="/expert/dashboard" onClick={() => setOpen(false)}>
              Expert dashboard
            </Link>
          ) : null}
          <Link href="/dashboard" onClick={() => setOpen(false)}>
            My dashboard
          </Link>
          <Link href="/dashboard/profile" onClick={() => setOpen(false)}>
            Profile and name
          </Link>
          <form action={signOutAction}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Public header and the mobile floating tab bar (website design). Reads the
 * current visitor's real auth state; the expert profile page hides the tab
 * bar because its booking bar sits in the same place.
 */
export function SiteChrome({ isLoggedIn, isApprovedExpert, isAdmin }: Props) {
  const pathname = usePathname();

  // Where "My dashboard" goes for this person.
  const homeHref = isAdmin ? "/admin" : isApprovedExpert ? "/expert/dashboard" : "/dashboard";
  const sections = siteNav({ isApprovedExpert });
  const showTabbar = !/^\/experts\/[^/]+/.test(pathname);

  return (
    <>
      <header className="pr-head">
        <div className="wrap bar">
          <Link href="/" className="logo" aria-label="Pivotroom home">
            <SiteLogo />
          </Link>
          <MegaNav sections={sections} />
          <div className="acts acts-desk">
            {isLoggedIn ? (
              <>
                <AccountMenu isApprovedExpert={isApprovedExpert} isAdmin={isAdmin} />
                <SignOutIconButton />
              </>
            ) : (
              <Link href="/auth/login" className="signin">
                Sign in
              </Link>
            )}
            <Link href={isLoggedIn ? homeHref : "/experts"} className="btn btn-ink hide-sm">
              {isLoggedIn ? "My dashboard" : "Book an expert"}{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
          <MobileMenu who={{ isLoggedIn, isApprovedExpert, isAdmin }} sections={sections} />
        </div>
      </header>

      {showTabbar ? (
        <MobileTabBar isLoggedIn={isLoggedIn} isApprovedExpert={isApprovedExpert} isAdmin={isAdmin} />
      ) : null}
    </>
  );
}
