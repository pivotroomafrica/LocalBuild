"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { SignOutIconButton } from "@/components/site/SignOutIconButton";

type Props = {
  isLoggedIn: boolean;
  isApprovedExpert: boolean;
  isAdmin: boolean;
};

/** The wordmark lockup from the website design (fixed brand asset). */
export function SiteLogo({ tone = "ink" }: { tone?: "ink" | "white" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG brand asset.
    <img
      src={tone === "ink" ? "/brand/pivotroom-ink.svg" : "/brand/pivotroom-white.svg"}
      alt="Pivotroom"
      width={159}
      height={28}
      style={{ height: 28, width: "auto", display: "block", alignSelf: "flex-start" }}
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
function isCurrentPath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The site's main menu (public header and the client/expert dashboards). */
export function MainNav({ isApprovedExpert }: { isApprovedExpert: boolean }) {
  const pathname = usePathname();
  const nav = [
    { href: "/experts", label: "Find an expert" },
    isApprovedExpert
      ? { href: "/expert/dashboard", label: "Expert dashboard" }
      : { href: "/become-an-expert", label: "Become an expert" },
    { href: "/about", label: "About" },
  ];
  return (
    <nav aria-label="Main">
      {nav.map((link) => (
        <Link key={link.href} href={link.href} aria-current={isCurrentPath(pathname, link.href) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function SiteChrome({ isLoggedIn, isApprovedExpert, isAdmin }: Props) {
  const pathname = usePathname();

  // Where "My dashboard" goes for this person.
  const homeHref = isAdmin ? "/admin" : isApprovedExpert ? "/expert/dashboard" : "/dashboard";
  const tabs = [
    { href: "/", icon: "home", label: "Home" },
    { href: "/experts", icon: "search", label: "Find" },
    ...(isLoggedIn
      ? [
          {
            href: homeHref,
            icon: "space_dashboard",
            label: "Dashboard",
          },
        ]
      : []),
    { href: "/become-an-expert", icon: "work", label: "For experts" },
  ];

  const isCurrent = (href: string) => isCurrentPath(pathname, href);

  const showTabbar = !/^\/experts\/[^/]+/.test(pathname);

  return (
    <>
      <header className="pr-head">
        <div className="wrap bar">
          <Link href="/" className="logo" aria-label="Pivotroom home">
            <SiteLogo />
          </Link>
          <MainNav isApprovedExpert={isApprovedExpert} />
          <div className="acts">
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
        </div>
      </header>

      {showTabbar ? (
        <nav className="pr-tabbar" aria-label="Main">
          <div className="items">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={isCurrent(tab.href) ? "tab on" : "tab"}
                aria-current={isCurrent(tab.href) ? "page" : undefined}
              >
                <span className="ms" aria-hidden="true">
                  {tab.icon}
                </span>
                <span className="tl">{tab.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </>
  );
}
