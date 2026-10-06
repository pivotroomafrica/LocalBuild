"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { ExpertCardData } from "@/components/expert/ExpertCard";

type Props = {
  experts: ExpertCardData[];
};

/**
 * Global expert search: a trigger button (styled to sit in the header,
 * next to the logo) plus a command-palette-style modal, opened by
 * clicking the trigger OR Cmd+K/Ctrl+K from anywhere. Real data only --
 * `experts` is the same published-only list every other homepage section
 * already fetches (no second query shape, no fabricated results).
 *
 * The category pills are derived from the real categoryNames already on
 * each expert (a union, not a second query) -- never a hardcoded English-
 * language bucket list unrelated to the actual taxonomy.
 *
 * Enter with no result highlighted falls through to the SAME real
 * /experts?q= filter the plain header search used before (name-only, see
 * app/(public)/experts/page.tsx) -- this modal is a faster way to reach
 * that search, not a second, different one.
 */
export function SearchModal({ experts }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const expert of experts) {
      for (const name of expert.categoryNames) set.add(name);
    }
    return Array.from(set).sort();
  }, [experts]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return experts.filter((expert) => {
      if (category && !expert.categoryNames.includes(category)) return false;
      if (!needle) return true;
      const haystack = [expert.fullName, expert.headline, expert.currentPosition, expert.currentCompany]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [experts, query, category]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setCategory(null);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    closeAndReset();
    router.push(`/experts?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search experts"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-transparent px-1 py-1.5 text-left transition-colors hover:border-[var(--color-border)]"
      >
        <Icon name="search" size={20} className="shrink-0 text-[var(--color-text-muted)]" decorative />
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text-muted)]">Search experts by name</span>
        <span className="hidden shrink-0 rounded-[var(--radius-chip)] border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)] sm:inline-block">
          ⌘K
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--color-ink)]/40 px-4 pt-20 sm:pt-28"
          onClick={closeAndReset}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search experts"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[0_24px_64px_rgba(13,15,18,0.24)]"
          >
            <form onSubmit={onSubmit} className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <Icon name="search" size={20} className="shrink-0 text-[var(--color-text-muted)]" decorative />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, role, or company..."
                className="min-w-0 flex-1 bg-transparent text-base text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
              />
              <button
                type="button"
                onClick={closeAndReset}
                className="shrink-0 rounded-[var(--radius-chip)] border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                ESC
              </button>
            </form>

            {categories.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] px-5 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setCategory(null)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === null
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      category === cat
                        ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-between px-5 py-2 text-xs text-[var(--color-text-muted)]">
              <span>
                {results.length} expert{results.length === 1 ? "" : "s"}
              </span>
              <span>Press ESC to close</span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {results.length > 0 ? (
                results.slice(0, 20).map((expert) => (
                  <Link
                    key={expert.slug}
                    href={`/experts/${expert.slug}`}
                    onClick={closeAndReset}
                    className="flex items-center gap-3 rounded-[var(--radius-input)] px-3 py-2.5 hover:bg-[var(--color-bg)]"
                  >
                    {expert.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed URL, expires hourly (same reasoning as ExpertCard).
                      <img src={expert.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-mist)]">
                        <span className="text-xs font-bold text-[var(--color-text-muted)]">
                          {expert.fullName.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">{expert.fullName}</p>
                      <p className="truncate text-xs text-[var(--color-text-muted)]">
                        {expert.headline || [expert.currentPosition, expert.currentCompany].filter(Boolean).join(" at ")}
                      </p>
                    </div>
                    {expert.startingPrice ? (
                      <span className="tabular-nums-brand shrink-0 text-xs font-medium text-[var(--color-text)]">
                        From {new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(expert.startingPrice)} ETB
                      </span>
                    ) : null}
                  </Link>
                ))
              ) : (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm font-medium text-[var(--color-text)]">No experts found</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Try a different name, or reset the category filter.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
