"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { ExpertPhoto } from "@/components/site/ExpertPhoto";
import { ExpertTile } from "@/components/site/ExpertTile";
import { CategoryIcon, SearchIcon, VerifiedIcon } from "@/components/site/icons";
import { formatEtb, matchesName, summaryLine } from "@/components/site/format";

type SortKey = "featured" | "price-low" | "price-high";

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Find your expert",
    description: "Browse vetted founders, executives and operators, and narrow down by the problem you're working on.",
  },
  {
    step: "02",
    title: "Book a 1-on-1 session",
    description: "Pick a session length the expert offers and reserve a real time straight from their availability.",
  },
  {
    step: "03",
    title: "Get personalized advice",
    description: "Meet online or in person, bring your questions, and leave with clear next steps for your situation.",
  },
];

function sortExperts(list: PublicDirectoryCard[], sortBy: SortKey) {
  if (sortBy === "featured") return list;
  const direction = sortBy === "price-low" ? 1 : -1;
  return [...list].sort((a, b) => direction * ((a.startingPrice ?? 0) - (b.startingPrice ?? 0)));
}

/**
 * Homepage (intro design). Every number and name on it is real: the hero
 * count is the published-expert count, the category bar is the real
 * expert_categories taxonomy, the grid is the published directory, and the
 * search is the same name-only search the header modal uses. Sections that
 * only exist with fabricated data (press logos, testimonials, investors,
 * star ratings, gift cards) are intentionally not rendered.
 */
export function HomeClient({ experts, categories }: { experts: PublicDirectoryCard[]; categories: string[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("featured");

  const searchMatches = useMemo(() => experts.filter((expert) => matchesName(expert, searchQuery)), [experts, searchQuery]);

  const directory = useMemo(
    () => sortExperts(searchMatches.filter((expert) => !category || expert.categoryNames.includes(category)), sortBy),
    [searchMatches, category, sortBy],
  );

  function selectCategory(name: string | null) {
    setCategory(name);
    document.getElementById("experts-directory")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <section className="hero-section">
        <div className="hero-glow-1" />
        <div className="hero-glow-2" />
        <div className="hero-container">
          {experts.length > 0 ? (
            <div className="hero-badge-pill">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              {experts.length} vetted {experts.length === 1 ? "expert" : "experts"} ready for 1-on-1 sessions
            </div>
          ) : null}

          <h1 className="hero-title">Book Africa&apos;s most experienced experts &amp; get advice 1-on-1</h1>

          <p className="hero-subtitle">
            Skip months of guesswork. Connect 1-on-1 with founders, executives and operators who&apos;ve already
            solved the problems you&apos;re facing.
          </p>

          <div className="hero-search-wrapper">
            <div className="hero-search-box">
              <SearchIcon className="text-[#8c8996]" />
              <input
                type="text"
                placeholder="Search experts by name..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="hero-search-input"
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery("")} className="px-2 text-xs text-gray-400 hover:text-white">
                  Clear
                </button>
              ) : null}
              <a href="#experts-directory" className="hero-search-btn-cta">
                Find an Expert
              </a>
            </div>

            {searchQuery.trim() !== "" ? (
              <div className="hero-suggestions-dropdown luxury-shadow-lg">
                <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                  Matching experts ({searchMatches.length})
                </div>
                {searchMatches.slice(0, 5).map((expert) => (
                  <Link key={expert.slug} href={`/experts/${expert.slug}`} className="suggestion-item">
                    <ExpertPhoto photoUrl={expert.photoUrl} fullName={expert.fullName} className="suggestion-avatar" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-bold text-white">
                        {expert.fullName}
                        <VerifiedIcon className="h-3.5 w-3.5 flex-shrink-0" />
                      </div>
                      <div className="truncate text-xs text-gray-400">{summaryLine(expert)}</div>
                    </div>
                    {expert.startingPrice != null ? (
                      <div className="flex-shrink-0 text-right">
                        <span className="text-xs font-bold text-white">{formatEtb(expert.startingPrice)}</span>
                        <span className="block text-[11px] text-gray-400">from / session</span>
                      </div>
                    ) : null}
                  </Link>
                ))}
                <Link
                  href={`/experts?q=${encodeURIComponent(searchQuery.trim())}`}
                  className="mt-1 block border-t border-white/10 py-2 text-center text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Search the full directory →
                </Link>
              </div>
            ) : null}
          </div>

          <div className="hero-ctas">
            <a href="#experts-directory" className="btn-hero-primary">
              Browse All Experts
            </a>
          </div>
        </div>
      </section>

      <section className="guarantees-section">
        <div className="guarantees-container">
          <div className="guarantee-card">
            <div className="guarantee-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <h3 className="guarantee-title">Learn from people who&apos;ve done it</h3>
            <p className="guarantee-desc">
              Every expert on Pivotroom is reviewed and approved before their profile goes live.
            </p>
          </div>

          <div className="guarantee-card">
            <div className="guarantee-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 10l5 5-5 5" />
                <path d="M4 4v7a4 4 0 0 0 4 4h12" />
              </svg>
            </div>
            <h3 className="guarantee-title">Personalized advice just for you</h3>
            <p className="guarantee-desc">
              Book a focused 1-on-1 session, online or in person, and get guidance for your exact situation.
            </p>
          </div>

          <div className="guarantee-card">
            <div className="guarantee-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className="guarantee-title">Book and pay securely</h3>
            <p className="guarantee-desc">
              Reserve a real time from the expert&apos;s calendar and pay by Chapa or bank transfer, verified before
              your session is confirmed.
            </p>
          </div>
        </div>
      </section>

      <section className="category-filter-section">
        <div className="category-filter-container">
          <div className="category-pills-list no-scrollbar">
            {[null, ...categories].map((name) => (
              <button
                key={name ?? "all"}
                type="button"
                onClick={() => selectCategory(name)}
                className={`category-pill ${category === name ? "active" : ""}`}
              >
                <CategoryIcon name={name} />
                <span>{name ?? "All"}</span>
              </button>
            ))}
          </div>

          <div className="category-actions-right">
            <span className="category-counter">
              {directory.length} {directory.length === 1 ? "Expert" : "Experts"}
            </span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
              className="sort-select"
              aria-label="Sort experts"
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </div>
        </div>
      </section>

      <section id="experts-directory" className="experts-section">
        <div className="experts-container">
          {searchQuery.trim() ? (
            <div className="section-header-wrap">
              <div>
                <p className="section-subtext">
                  Showing results matching &ldquo;<strong>{searchQuery.trim()}</strong>&rdquo;
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="ml-3 text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    Clear search
                  </button>
                </p>
              </div>
            </div>
          ) : null}

          {directory.length === 0 ? (
            <div className="rounded-2xl border border-[#e5dfd5] bg-white py-20 text-center">
              <p className="text-xl font-bold text-[#1a1921]">
                {experts.length === 0 ? "No experts on Pivotroom yet" : "No experts found"}
              </p>
              <p className="mb-6 mt-2 text-[#6a6871]">
                {experts.length === 0
                  ? "We're adding people. Check back soon."
                  : "Nothing matches that search and category combination."}
              </p>
              {experts.length > 0 ? (
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setCategory(null);
                    }}
                    className="rounded-full bg-[#1a1921] px-6 py-2.5 font-medium text-white"
                  >
                    Reset Search
                  </button>
                  <Link href="/experts" className="rounded-full bg-[#f4efe7] px-6 py-2.5 font-medium text-[#1a1921] hover:bg-[#e8e1d5]">
                    Browse the Directory →
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="home-group-section">
              <div className="home-group-header">
                <h2 className="home-group-title">{category ?? "All Experts"}</h2>
              </div>
              <div className="experts-grid">
                {directory.map((expert) => (
                  <ExpertTile key={expert.slug} expert={expert} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="how-container">
          <div className="how-header">
            <span className="how-tag">Simple &amp; Seamless</span>
            <h2 className="how-title">How Pivotroom Works</h2>
            <p className="text-lg text-[#6a6871]">Get years of hard-won experience in a single conversation.</p>
          </div>

          <div className="how-steps-grid">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="how-step-card">
                <div className="how-step-num">{item.step}</div>
                <h3 className="how-step-title">{item.title}</h3>
                <p className="how-step-desc">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
