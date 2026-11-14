"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { SiteLogo } from "@/components/site/SiteChrome";

type Who = { isLoggedIn: boolean; isApprovedExpert: boolean; isAdmin: boolean };
type NavLink = { href: string; label: string; icon: string };

function dashboardHref({ isAdmin, isApprovedExpert }: Who) {
  return isAdmin ? "/admin" : isApprovedExpert ? "/expert/dashboard" : "/dashboard";
}

function sessionsHref({ isAdmin, isApprovedExpert }: Who) {
  return isAdmin ? "/admin/bookings" : isApprovedExpert ? "/expert/sessions" : "/dashboard/sessions";
}

const PROFILE = "/dashboard/profile";

/** The tab whose address matches the current page most specifically. */
function activeHref(pathname: string, hrefs: string[]) {
  const matches = hrefs.filter((href) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  );
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

/**
 * Mobile bottom bar (app navbar guideline): five equal slots, 72px tall,
 * 24px icons with 12px labels, and a raised round "Find an expert" button
 * in the middle. The current page is highlighted. Profile goes to sign-in
 * when signed out.
 */
export function MobileTabBar(who: Who) {
  const pathname = usePathname();
  const side: NavLink[] = who.isLoggedIn
    ? [
        { href: "/", label: "Home", icon: "home" },
        { href: dashboardHref(who), label: "Dashboard", icon: "space_dashboard" },
        { href: sessionsHref(who), label: "Sessions", icon: "event" },
        { href: PROFILE, label: "Profile", icon: "person" },
      ]
    : [
        { href: "/", label: "Home", icon: "home" },
        { href: "/about", label: "About", icon: "info" },
        { href: "/help", label: "Help", icon: "help" },
        { href: `/auth/login?next=${encodeURIComponent(PROFILE)}`, label: "Profile", icon: "person" },
      ];
  const signInPage = !who.isLoggedIn && pathname.startsWith("/auth/");
  const current = activeHref(pathname, [...side.map((tab) => tab.href.split("?")[0]), "/experts"]);
  const isOn = (href: string) =>
    href.startsWith("/auth/login") ? signInPage : current === href.split("?")[0];

  const tab = (link: NavLink) => (
    <Link
      key={link.label}
      href={link.href}
      className={isOn(link.href) ? "mt-tab on" : "mt-tab"}
      aria-current={isOn(link.href) ? "page" : undefined}
    >
      <span className="ms" aria-hidden="true">
        {link.icon}
      </span>
      <span className="mt-label">{link.label}</span>
    </Link>
  );

  return (
    <nav className="mtabbar" aria-label="Main">
      {tab(side[0])}
      {tab(side[1])}
      <Link
        href="/experts"
        className={current === "/experts" ? "mt-center on" : "mt-center"}
        aria-label="Find an expert"
        aria-current={current === "/experts" ? "page" : undefined}
      >
        <span className="mt-fab">
          <span className="ms" aria-hidden="true">
            search
          </span>
        </span>
      </Link>
      {tab(side[2])}
      {tab(side[3])}
    </nav>
  );
}

/**
 * ☰ button for phones, opening a side menu with every link: the site's
 * pages, this dashboard's sections (when given) and the account.
 */
export function MobileMenu({ who, areaItems }: { who: Who; areaItems?: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const button = buttonRef.current;
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);
  const site: NavLink[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/experts", label: "Find an expert", icon: "search" },
    who.isApprovedExpert
      ? { href: "/expert/dashboard", label: "Expert dashboard", icon: "work" }
      : { href: "/become-an-expert", label: "Become an expert", icon: "work" },
    { href: "/about", label: "About", icon: "info" },
    { href: "/help", label: "Help and FAQ", icon: "help" },
    { href: "/contact", label: "Contact", icon: "mail" },
  ];
  const account: NavLink[] = who.isLoggedIn
    ? [
        ...(who.isAdmin ? [{ href: "/admin", label: "Admin dashboard", icon: "admin_panel_settings" }] : []),
        { href: "/dashboard", label: "My dashboard", icon: "space_dashboard" },
        { href: PROFILE, label: "Profile and name", icon: "person" },
      ]
    : [];

  const list = (links: NavLink[]) => (
    <ul className="mm-list">
      {links.map((link) => (
        <li key={link.href + link.label}>
          <Link href={link.href} onClick={close}>
            <span className="ms" aria-hidden="true">
              {link.icon}
            </span>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="mm-button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
      >
        <span className="ms" aria-hidden="true">
          menu
        </span>
      </button>
      {open ? (
        <div className="mm-root">
          <button type="button" className="mm-backdrop" aria-label="Close menu" tabIndex={-1} onClick={close} />
          <div id="mobile-menu" ref={panelRef} className="mm-panel" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="mm-head">
              <Link href="/" onClick={close} aria-label="Pivotroom home">
                <SiteLogo />
              </Link>
              <button type="button" className="mm-close" aria-label="Close menu" onClick={close}>
                <span className="ms" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            {areaItems && areaItems.length > 0 ? (
              <>
                <p className="mm-title">This dashboard</p>
                {list(areaItems)}
              </>
            ) : null}
            <p className="mm-title">Pivotroom</p>
            {list(site)}
            {who.isLoggedIn ? (
              <>
                <p className="mm-title">Your account</p>
                {list(account)}
                <form action={signOutAction} className="mm-signout">
                  <button type="submit">
                    <span className="ms" aria-hidden="true">
                      logout
                    </span>
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <div className="mm-auth">
                <Link href="/auth/login" className="btn btn-ink md block" onClick={close}>
                  Sign in
                </Link>
                <Link href="/auth/signup" className="btn btn-line md block" onClick={close}>
                  Create account
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
