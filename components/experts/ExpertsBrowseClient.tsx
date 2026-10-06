"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ExpertCard, type ExpertCardData } from "@/components/expert/ExpertCard";

type SortKey = "featured" | "price-low" | "price-high" | "name-az";
type PriceFilter = "all" | "under-2000" | "2000-5000" | "over-5000";
type ViewMode = "grid" | "list";

type Props = {
  experts: ExpertCardData[];
  categories: string[];
  initialQuery: string;
  initialCategory: string | null;
};

/**
 * Browse/filter/sort interaction for /experts -- real published experts
 * only, real category taxonomy (no hardcoded English-language buckets
 * unrelated to expert_categories), and no fabricated signals: there is no
 * star rating anywhere in this schema, so there is no "Top Rated" pill or
 * rating sort here, unlike a marketplace that has one.
 *
 * `q`/`category` arrive pre-seeded from the URL (the homepage search and
 * ProblemDiscovery links still work exactly as before -- see
 * app/(public)/experts/page.tsx), then everything else (price, sort, view
 * mode, and further search refinement) is held in local state so it
 * doesn't need a full page round-trip per filter change.
 */
export function ExpertsBrowseClient({ experts, categories, initialQuery, initialCategory }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("featured");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const filteredExperts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = experts.filter((expert) => {
      if (selectedCategory && !expert.categoryNames.includes(selectedCategory)) return false;

      if (needle) {
        const haystack = [expert.fullName, expert.headline, expert.currentPosition, expert.currentCompany]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      if (priceFilter !== "all") {
        const price = expert.startingPrice ?? 0;
        if (priceFilter === "under-2000" && price > 2000) return false;
        if (priceFilter === "2000-5000" && (price < 2000 || price > 5000)) return false;
        if (priceFilter === "over-5000" && price < 5000) return false;
      }

      return true;
    });

    if (sortBy === "price-low") {
      list = [...list].sort((a, b) => (a.startingPrice ?? 0) - (b.startingPrice ?? 0));
    } else if (sortBy === "price-high") {
      list = [...list].sort((a, b) => (b.startingPrice ?? 0) - (a.startingPrice ?? 0));
    } else if (sortBy === "name-az") {
      list = [...list].sort((a, b) => a.fullName.localeCompare(b.fullName));
    }

    return list;
  }, [experts, query, selectedCategory, priceFilter, sortBy]);

  const isFilteringActive = query.trim() !== "" || selectedCategory !== null || priceFilter !== "all" || sortBy !== "featured";

  function resetFilters() {
    setQuery("");
    setSelectedCategory(null);
    setPriceFilter("all");
    setSortBy("featured");
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5">
        <Icon name="search" size={20} className="shrink-0 text-[var(--color-text-muted)]" decorative />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, role, or company"
          className="w-full min-w-0 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="shrink-0 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            Clear
          </button>
        ) : null}
      </div>

      {categories.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === null
                ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            All experts
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-[var(--color-border)] py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-text-muted)]">
            {filteredExperts.length} expert{filteredExperts.length === 1 ? "" : "s"}
          </span>
          {isFilteringActive ? (
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm font-medium text-[var(--color-accent)] hover:underline"
            >
              Reset filters
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={priceFilter}
            onChange={(event) => setPriceFilter(event.target.value as PriceFilter)}
            aria-label="Filter by price"
            className="rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            <option value="all">All prices</option>
            <option value="under-2000">Under 2,000 ETB</option>
            <option value="2000-5000">2,000 – 5,000 ETB</option>
            <option value="over-5000">5,000+ ETB</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortKey)}
            aria-label="Sort experts"
            className="rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            <option value="featured">Featured</option>
            <option value="price-low">Price: Low to high</option>
            <option value="price-high">Price: High to low</option>
            <option value="name-az">Name: A to Z</option>
          </select>

          <div className="flex items-center gap-1 rounded-[var(--radius-input)] border border-[var(--color-border)] p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              className={`flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius-input)-4px)] ${
                viewMode === "grid" ? "bg-[var(--color-mist)] text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              <Icon name="grid_view" size={18} decorative />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={`flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius-input)-4px)] ${
                viewMode === "list" ? "bg-[var(--color-mist)] text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              <Icon name="view_list" size={18} decorative />
            </button>
          </div>
        </div>
      </div>

      {filteredExperts.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
          <p className="text-base font-medium text-[var(--color-text)]">No experts match your filters</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
            Try a different search, or reset your filters.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-[var(--color-brand)] px-6 text-sm font-medium text-[var(--color-on-brand)] hover:bg-[var(--color-brand-hover)]"
          >
            Reset filters
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredExperts.map((expert) => (
            <ExpertCard key={expert.slug} expert={expert} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredExperts.map((expert) => {
            const credibility = [expert.currentPosition, expert.currentCompany].filter(Boolean).join(" at ");
            return (
              <Link
                key={expert.slug}
                href={`/experts/${expert.slug}`}
                className="flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-text)]"
              >
                {expert.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires hourly (same reasoning as ExpertCard).
                  <img src={expert.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-mist)]">
                    <span className="font-display text-xl font-bold text-[var(--color-text-muted)]">
                      {expert.fullName.charAt(0)}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold text-[var(--color-text)]">{expert.fullName}</p>
                  {credibility ? (
                    <p className="truncate text-sm text-[var(--color-text-muted)]">{credibility}</p>
                  ) : null}
                  {expert.categoryNames.length > 0 ? (
                    <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                      {expert.categoryNames.slice(0, 3).join(" · ")}
                    </p>
                  ) : null}
                </div>
                {expert.startingPrice ? (
                  <span className="tabular-nums-brand shrink-0 text-sm font-medium text-[var(--color-text)]">
                    From {new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(expert.startingPrice)} ETB
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
