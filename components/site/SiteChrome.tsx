"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/ui/BrandLogo";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { ExpertPhoto } from "@/components/site/ExpertPhoto";
import { SearchIcon, VerifiedIcon } from "@/components/site/icons";
import { formatEtb, matchesName, summaryLine } from "@/components/site/format";

type Props = {
  isLoggedIn: boolean;
  isApprovedExpert: boolean;
  experts: PublicDirectoryCard[];
  categories: string[];
};

const subscribeNever = () => () => {};

/**
 * Public-site chrome: sticky header, mobile menu, the Cmd/Ctrl+K expert
 * search modal, and the mobile bottom tab bar -- one component so the
 * header button, the keyboard shortcut and the bottom "Search" tab all open
 * the same modal. Searches the real published directory (name-only, per the
 * agreed search scope); results open the real profile, where booking lives.
 */
export function SiteChrome({ isLoggedIn, isApprovedExpert, experts, categories }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const isMac = useSyncExternalStore(
    subscribeNever,
    () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
    () => true,
  );

  const navLinks = [
    { href: "/experts", label: "Browse Experts" },
    { href: "/#how-it-works", label: "How It Works" },
    ...(isLoggedIn
      ? [
          { href: "/dashboard", label: "Dashboard" },
          ...(isApprovedExpert ? [{ href: "/expert/dashboard", label: "Expert Dashboard" }] : []),
        ]
      : [{ href: "/become-an-expert", label: "Become an Expert" }]),
  ];

  const results = useMemo(
    () => experts.filter((expert) => (!category || expert.categoryNames.includes(category)) && matchesName(expert, query)),
    [experts, category, query],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenuOpen(false);
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [searchOpen]);

  function openSearch() {
    setMenuOpen(false);
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    setCategory(null);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    closeSearch();
    router.push(trimmed ? `/experts?q=${encodeURIComponent(trimmed)}` : "/experts");
  }

  function isActive(href: string) {
    return href === "/experts" ? pathname.startsWith("/experts") : pathname === href;
  }

  // The expert profile renders the booking rail's own mobile bottom bar;
  // two fixed bars would stack on top of each other.
  const showBottomNav = !pathname.startsWith("/experts/");
  const accountHref = isLoggedIn ? "/dashboard" : "/auth/login";

  return (
    <>
      <header className="site-nav">
        <div className="nav-container">
          <div className="nav-left">
            <Link href="/" className="nav-logo-link" aria-label="Pivotroom home">
              <BrandLogo size={26} className="text-white" />
            </Link>
            <nav className="nav-links">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-link ${isActive(link.href) ? "active text-white font-semibold" : ""}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="nav-right">
            <button type="button" onClick={openSearch} className="nav-search-btn" aria-label="Search experts">
              <SearchIcon width={15} height={15} />
              <span>Search experts...</span>
              <span className="nav-search-kbd">{isMac ? "⌘K" : "Ctrl K"}</span>
            </button>

            {isLoggedIn ? (
              <form action={signOutAction}>
                <button type="submit" className="nav-btn-text">
                  Log out
                </button>
              </form>
            ) : (
              <>
                <Link href="/auth/login" className="nav-btn-text">
                  Log in
                </Link>
                <Link href="/auth/signup" className="nav-btn-signup">
                  Sign up
                </Link>
              </>
            )}

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
          <div className="flex flex-col gap-3 border-t border-white/10 bg-[#1e1d24] px-6 py-4 md:hidden">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`py-2 ${isActive(link.href) ? "font-semibold text-white" : "text-[#cfccd6]"}`}
              >
                {link.label}
              </Link>
            ))}
            {isLoggedIn ? (
              <form action={signOutAction}>
                <button type="submit" className="py-2 text-left text-[#cfccd6]">
                  Log out
                </button>
              </form>
            ) : (
              <Link href="/auth/login" onClick={() => setMenuOpen(false)} className="py-2 text-[#cfccd6]">
                Log in
              </Link>
            )}
            <button
              type="button"
              onClick={openSearch}
              className="mt-2 w-full rounded-full bg-white py-2.5 text-center font-semibold text-[#1a1921]"
            >
              Find an Expert
            </button>
          </div>
        ) : null}
      </header>

      {searchOpen ? (
        <div className="modal-overlay" onClick={closeSearch}>
          <div
            className="modal-content search-modal-content"
            role="dialog"
            aria-modal="true"
            aria-label="Search experts"
            onClick={(event) => event.stopPropagation()}
          >
            <form className="search-input-header" onSubmit={submitSearch}>
              <SearchIcon width={20} height={20} />
              <input
                autoFocus
                type="text"
                placeholder="Search experts by name..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="search-modal-input"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="search-clear-btn" aria-label="Clear search">
                  ✕
                </button>
              ) : null}
              <button type="button" onClick={closeSearch} className="search-esc-badge">
                ESC
              </button>
            </form>

            {categories.length > 0 ? (
              <div className="search-modal-categories">
                {[null, ...categories].map((name) => (
                  <button
                    key={name ?? "all"}
                    type="button"
                    onClick={() => setCategory(name)}
                    className={`search-cat-pill ${category === name ? "active" : ""}`}
                  >
                    {name ?? "All"}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="search-results-meta">
              <span>
                {results.length} {results.length === 1 ? "Expert" : "Experts"} Available
              </span>
              <span className="text-[11px] font-normal lowercase">Press ESC to close</span>
            </div>

            <div className="search-results-list">
              {results.length > 0 ? (
                results.slice(0, 16).map((expert) => (
                  <Link
                    key={expert.slug}
                    href={`/experts/${expert.slug}`}
                    onClick={closeSearch}
                    className="search-result-row"
                  >
                    <div className="search-result-left">
                      <ExpertPhoto photoUrl={expert.photoUrl} fullName={expert.fullName} className="search-result-avatar" />
                      <div className="search-result-info">
                        <div className="search-result-title-row">
                          <span className="search-result-name">{expert.fullName}</span>
                          <VerifiedIcon className="search-result-verified" />
                        </div>
                        <div className="search-result-bio">{summaryLine(expert)}</div>
                      </div>
                    </div>
                    <div className="search-result-right">
                      {expert.startingPrice != null ? (
                        <span className="search-result-price">From {formatEtb(expert.startingPrice)}</span>
                      ) : null}
                      <span className="search-result-cta">Book Session →</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="search-empty-state">
                  <div className="search-empty-icon flex items-center justify-center">
                    <SearchIcon width={40} height={40} className="text-gray-400" />
                  </div>
                  <div className="search-empty-title">
                    {query.trim() ? (
                      <>No experts found matching &ldquo;{query.trim()}&rdquo;</>
                    ) : category ? (
                      "No experts in this category yet"
                    ) : (
                      "No experts on Pivotroom yet"
                    )}
                  </div>
                  <div className="search-empty-hint">
                    {experts.length === 0 ? "We're adding people. Check back soon." : "Try a different name, or reset the category filter."}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showBottomNav ? (
        <nav className="mobile-app-bottom-nav" aria-label="Mobile navigation">
          <Link href="/" className={`mobile-nav-tab ${pathname === "/" ? "active" : ""}`}>
            <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className="mobile-nav-label">Explore</span>
          </Link>
          <Link href="/experts" className={`mobile-nav-tab ${pathname === "/experts" ? "active" : ""}`}>
            <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="mobile-nav-label">Experts</span>
          </Link>
          <button type="button" onClick={openSearch} className="mobile-nav-tab">
            <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="mobile-nav-label">Search</span>
          </button>
          <Link href={accountHref} className={`mobile-nav-tab ${pathname === accountHref ? "active" : ""}`}>
            <svg className="mobile-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="mobile-nav-label">Account</span>
          </Link>
        </nav>
      ) : null}
    </>
  );
}
