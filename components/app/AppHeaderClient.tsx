"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/ui/BrandLogo";

export type AppNavLink = { href: string; label: string; match: string };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function AppHeaderClient({ links, displayName }: { links: AppNavLink[]; displayName: string | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (link: AppNavLink) => new RegExp(`^${link.match}(/|$)`).test(pathname);

  return (
    <header className="site-nav">
      <div className="nav-container">
        <div className="nav-left">
          <Link href="/" className="nav-logo-link" aria-label="Pivotroom home">
            <BrandLogo size={26} className="text-white" />
          </Link>
          <nav className="nav-links" aria-label="Workspace">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link) ? "page" : undefined}
                className={`nav-link ${isActive(link) ? "font-semibold !text-white" : ""}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="nav-right">
          {displayName ? (
            <Link
              href="/dashboard/profile"
              className="hidden items-center gap-2.5 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3.5 text-[13px] font-semibold text-[#e7e5ec] transition-colors hover:bg-white/10 sm:flex"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-[#1a1921]">
                {initials(displayName)}
              </span>
              <span className="max-w-[160px] truncate">{displayName}</span>
            </Link>
          ) : null}
          <form action={signOutAction}>
            <button type="submit" className="nav-btn-text">
              Log out
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="mobile-menu-btn"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="flex flex-col gap-1 border-t border-white/10 bg-[#1e1d24] px-6 py-4 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`py-2.5 ${isActive(link) ? "font-semibold text-white" : "text-[#cfccd6]"}`}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/dashboard/profile" onClick={() => setMenuOpen(false)} className="py-2.5 text-[#cfccd6]">
            Profile
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="py-2.5 text-left text-[#cfccd6]">
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </header>
  );
}
