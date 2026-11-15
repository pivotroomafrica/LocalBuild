"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { SiteLogo } from "@/components/site/SiteChrome";
import { ArrowBox } from "@/components/site/MegaNav";
import type { NavSection } from "@/lib/site/nav";

type Who = { isLoggedIn: boolean; isApprovedExpert: boolean; isAdmin: boolean };
type NavLink = { href: string; label: string; icon: string };

function dashboardHref({ isAdmin, isApprovedExpert }: Who) {
  return isAdmin ? "/admin" : isApprovedExpert ? "/expert/dashboard" : "/dashboard";
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
  const home: NavLink = { href: "/", label: "Home", icon: "home" };
  const profile: NavLink = who.isLoggedIn
    ? { href: PROFILE, label: "Profile", icon: "person" }
    : { href: `/auth/login?next=${encodeURIComponent(PROFILE)}`, label: "Profile", icon: "person" };
  const signInPage = !who.isLoggedIn && pathname.startsWith("/auth/");
  const current = activeHref(pathname, ["/", PROFILE, "/experts"]);
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
      {tab(home)}
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
      {tab(profile)}
    </nav>
  );
}

/**
 * ☰ button for phones, opening a full-screen menu that drills down: the
 * sections (How we help, Find an expert, For experts, About us), then a
 * section's sub-pages with a Back button. In dashboards it also lists the
 * dashboard's own sections.
 */
export function MobileMenu({
  who,
  sections,
  areaItems,
}: {
  who: Who;
  sections: NavSection[];
  areaItems?: NavLink[];
}) {
  const [open, setOpen] = useState(false);
  const [sectionKey, setSectionKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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

  // Move focus into the panel whenever it opens or changes level.
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>(".mm-level a, .mm-level button")?.focus();
  }, [open, sectionKey]);

  const close = () => {
    setOpen(false);
    setSectionKey(null);
  };
  const section = sections.find((item) => item.key === sectionKey) ?? null;
  const account: NavLink[] = who.isLoggedIn
    ? [
        ...(who.isAdmin ? [{ href: "/admin", label: "Admin dashboard", icon: "admin_panel_settings" }] : []),
        { href: dashboardHref(who), label: "My dashboard", icon: "space_dashboard" },
        { href: PROFILE, label: "Profile and name", icon: "person" },
      ]
    : [];

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
        <div id="mobile-menu" ref={panelRef} className="mm-sheet" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="mm-top">
            <Link href="/" onClick={close} aria-label="Pivotroom home">
              <SiteLogo />
            </Link>
            <span className="mm-top-acts">
              {who.isLoggedIn ? null : (
                <Link href="/auth/login" onClick={close} className="mm-login">
                  <span className="ms" aria-hidden="true">
                    person
                  </span>
                  Sign in
                </Link>
              )}
              <button type="button" className="mm-close" aria-label="Close menu" onClick={close}>
                <span className="ms" aria-hidden="true">
                  close
                </span>
              </button>
            </span>
          </div>

          {section ? (
            <div className="mm-level" key={section.key}>
              <button type="button" className="mm-back" onClick={() => setSectionKey(null)}>
                <span className="ms" aria-hidden="true">
                  chevron_left
                </span>
                Back
              </button>
              <Link href={section.href} className="mm-section-title" onClick={close}>
                {section.label}
                <ArrowBox large />
              </Link>
              <ul className="mm-sub">
                {section.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} onClick={close}>
                      <span>{link.label}</span>
                      <ArrowBox />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/experts" className="btn btn-ink md block" onClick={close}>
                Find an expert
              </Link>
            </div>
          ) : (
            <div className="mm-level" key="root">
              <ul className="mm-sections">
                {sections.map((item) => (
                  <li key={item.key}>
                    <button type="button" onClick={() => setSectionKey(item.key)}>
                      <span>{item.label}</span>
                      <span className="ms" aria-hidden="true">
                        chevron_right
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Link href="/experts" className="btn btn-ink md block" onClick={close}>
                Find an expert
              </Link>

              {areaItems && areaItems.length > 0 ? (
                <>
                  <p className="mm-title">This dashboard</p>
                  <ul className="mm-list">
                    {areaItems.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} onClick={close}>
                          <span className="ms" aria-hidden="true">
                            {link.icon}
                          </span>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {who.isLoggedIn ? (
                <>
                  <p className="mm-title">Your account</p>
                  <ul className="mm-list">
                    {account.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} onClick={close}>
                          <span className="ms" aria-hidden="true">
                            {link.icon}
                          </span>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
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
                <Link href="/auth/signup" className="btn btn-line md block" onClick={close}>
                  Create account
                </Link>
              )}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
