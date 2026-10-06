"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { ExpertPhoto } from "@/components/site/ExpertPhoto";
import { CategoryIcon, SearchIcon, VerifiedIcon } from "@/components/site/icons";
import { formatEtb, matchesName, summaryLine } from "@/components/site/format";

type SortKey = "featured" | "price-low" | "price-high" | "name-az";
type PriceFilter = "all" | "under-2500" | "2500-4000" | "over-4000";
type ViewMode = "grid" | "list";

function withinPrice(price: number | null, filter: PriceFilter) {
  if (filter === "all") return true;
  if (price == null) return false;
  if (filter === "under-2500") return price <= 2500;
  if (filter === "2500-4000") return price >= 2500 && price <= 4000;
  return price > 4000;
}

function PriceStack({ expert, unit }: { expert: PublicDirectoryCard; unit: string }) {
  if (expert.startingPrice == null) return <span />;
  return (
    // ETB prices are much longer than intro's "$500", so stack the unit
    // under the price instead of beside it (inline style: the scoped theme
    // CSS is unlayered and would beat Tailwind utilities).
    <div className="expert-dir-price-stack" style={{ flexDirection: "column", alignItems: "flex-start", gap: 0 }}>
      <span className="expert-dir-price whitespace-nowrap">From {formatEtb(expert.startingPrice)}</span>
      <span className="expert-dir-session">{unit}</span>
    </div>
  );
}

/**
 * /experts (intro design). Real published experts and the real category
 * taxonomy (categories drive the filter strip only -- cards don't show
 * category chips, so the photo gets the space); `q` / `category` arrive pre-seeded from the URL so the header
 * search and footer links still land on a filtered view. "Book Now" opens the
 * real profile, where the booking rail checks live availability -- there is
 * no separate quick-book form here.
 */
export function ExpertsDirectoryClient({
  experts,
  categories,
  initialQuery,
  initialCategory,
}: {
  experts: PublicDirectoryCard[];
  categories: string[];
  initialQuery: string;
  initialCategory: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(
    initialCategory && categories.includes(initialCategory) ? initialCategory : null,
  );
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("featured");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const filtered = useMemo(() => {
    const list = experts.filter(
      (expert) =>
        (!category || expert.categoryNames.includes(category)) &&
        matchesName(expert, searchQuery) &&
        withinPrice(expert.startingPrice, priceFilter),
    );
    if (sortBy === "price-low") return [...list].sort((a, b) => (a.startingPrice ?? 0) - (b.startingPrice ?? 0));
    if (sortBy === "price-high") return [...list].sort((a, b) => (b.startingPrice ?? 0) - (a.startingPrice ?? 0));
    if (sortBy === "name-az") return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName));
    return list;
  }, [experts, category, searchQuery, priceFilter, sortBy]);

  const isFiltering = searchQuery.trim() !== "" || category !== null || priceFilter !== "all" || sortBy !== "featured";

  function resetFilters() {
    setSearchQuery("");
    setCategory(null);
    setPriceFilter("all");
    setSortBy("featured");
  }

  return (
    <div className="experts-directory-main">
      <section className="experts-page-hero">
        <div className="experts-hero-inner">
          {experts.length > 0 ? (
            <div className="experts-hero-tag">
              <span>✦</span> {experts.length} VETTED {experts.length === 1 ? "EXPERT" : "EXPERTS"}
            </div>
          ) : null}
          <h1 className="experts-hero-title">Browse &amp; Book Experienced Experts</h1>
          <p className="experts-hero-subtitle">
            Book private 1-on-1 sessions with founders, executives and operators who&apos;ve been where you&apos;re
            trying to go.
          </p>

          <div className="experts-search-bar-wrap">
            <SearchIcon className="search-bar-icon" width={20} height={20} />
            <input
              type="text"
              placeholder="Search experts by name..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="experts-search-input"
            />
            {searchQuery ? (
              <button type="button" onClick={() => setSearchQuery("")} className="experts-search-clear">
                ✕ Clear
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {categories.length > 0 ? (
        <div className="experts-categories-strip">
          <div className="experts-categories-wrap">
            {[null, ...categories].map((name) => (
              <button
                key={name ?? "all"}
                type="button"
                onClick={() => setCategory(name)}
                className={`experts-cat-pill ${category === name ? "active" : ""}`}
              >
                <span className="cat-pill-icon">
                  <CategoryIcon name={name} className="cat-pill-svg h-[15px] w-[15px]" />
                </span>
                <span>{name ?? "All Experts"}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="experts-toolbar-bar">
        <div className="experts-count-meta">
          <span className="experts-count-number">{filtered.length}</span>
          <span className="experts-count-label">
            {filtered.length === 1 ? "Expert" : "Experts"} available to book
          </span>
          {isFiltering ? (
            <button type="button" onClick={resetFilters} className="reset-filters-pill-btn">
              Reset Filters ✕
            </button>
          ) : null}
        </div>

        <div className="experts-toolbar-controls">
          <div className="filter-select-wrap">
            <label htmlFor="price-filter" className="filter-select-label">
              Price:
            </label>
            <select
              id="price-filter"
              value={priceFilter}
              onChange={(event) => setPriceFilter(event.target.value as PriceFilter)}
              className="toolbar-select-dropdown"
            >
              <option value="all">All Rates</option>
              <option value="under-2500">Under 2,500 ETB</option>
              <option value="2500-4000">2,500 – 4,000 ETB</option>
              <option value="over-4000">4,000+ ETB</option>
            </select>
          </div>

          <div className="filter-select-wrap">
            <label htmlFor="sort-filter" className="filter-select-label">
              Sort:
            </label>
            <select
              id="sort-filter"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortKey)}
              className="toolbar-select-dropdown"
            >
              <option value="featured">Featured First</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="name-az">Name: A to Z</option>
            </select>
          </div>

          <div className="view-mode-toggle">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="experts-empty-state">
          <div className="empty-icon flex items-center justify-center">
            <SearchIcon width={44} height={44} className="text-gray-400" />
          </div>
          <h3 className="empty-title">{experts.length === 0 ? "No experts on Pivotroom yet" : "No experts match your filters"}</h3>
          <p className="empty-sub">
            {experts.length === 0
              ? "We're adding people. Check back soon."
              : "Try a different name, choose “All Experts”, or reset your filters."}
          </p>
          {experts.length > 0 ? (
            <button type="button" onClick={resetFilters} className="empty-reset-cta">
              Reset All Filters
            </button>
          ) : null}
        </div>
      ) : viewMode === "grid" ? (
        <div className="experts-grid-layout">
          {filtered.map((expert) => (
            <div key={expert.slug} className="expert-dir-card">
              <Link href={`/experts/${expert.slug}`} className="expert-card-top-link">
                <div className="expert-dir-img-wrap">
                  <ExpertPhoto photoUrl={expert.photoUrl} fullName={expert.fullName} className="expert-dir-img" lazy />
                </div>
                <div className="expert-dir-body">
                  <div className="expert-dir-name-row">
                    <h3 className="expert-dir-name">{expert.fullName}</h3>
                    <VerifiedIcon className="expert-dir-check" />
                  </div>
                  <p className="expert-dir-headline">{summaryLine(expert)}</p>
                </div>
              </Link>
              <div className="expert-dir-footer">
                <PriceStack expert={expert} unit="per session" />
                <Link href={`/experts/${expert.slug}`} className="expert-dir-book-btn whitespace-nowrap">
                  Book Now
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="experts-list-layout">
          {filtered.map((expert) => (
            <div key={expert.slug} className="expert-list-row">
              <Link href={`/experts/${expert.slug}`} className="expert-list-left-link">
                <ExpertPhoto photoUrl={expert.photoUrl} fullName={expert.fullName} className="expert-list-avatar" lazy />
                <div className="expert-list-details">
                  <div className="expert-list-title-row">
                    <span className="expert-list-name">{expert.fullName}</span>
                    <VerifiedIcon className="expert-dir-check" />
                  </div>
                  <p className="expert-list-bio">{summaryLine(expert)}</p>
                </div>
              </Link>
              <div className="expert-list-right">
                {expert.startingPrice != null ? (
                  <div className="expert-list-price-wrap">
                    <span className="expert-list-price">From {formatEtb(expert.startingPrice)}</span>
                    <span className="expert-list-unit">per session</span>
                  </div>
                ) : null}
                <Link href={`/experts/${expert.slug}`} className="expert-dir-book-btn whitespace-nowrap">
                  Book Now
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
