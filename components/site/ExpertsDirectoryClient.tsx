"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicDirectoryCard } from "@/lib/public/data";
import { ExpertCard } from "@/components/site/ExpertCard";

type SortKey = "best" | "price-low" | "price-high";
type PriceFilter = "any" | "under-5000" | "5000-15000" | "over-15000";
type FormatFilter = "any" | "online" | "in_person";

const PAGE_SIZE = 20;

const PRICE_LABELS: Record<PriceFilter, string> = {
  any: "any",
  "under-5000": "under ETB 5,000",
  "5000-15000": "ETB 5,000–15,000",
  "over-15000": "over ETB 15,000",
};

function withinPrice(price: number | null, filter: PriceFilter) {
  if (filter === "any") return true;
  if (price == null) return false;
  if (filter === "under-5000") return price < 5000;
  if (filter === "5000-15000") return price >= 5000 && price <= 15000;
  return price > 15000;
}

function matchesText(expert: PublicDirectoryCard, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [expert.fullName, expert.headline, expert.currentPosition, expert.currentCompany, ...expert.categoryNames]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(needle));
}

/** A text-styled native <select> ("Format: any ▾"), so it stays accessible
 * and works on every phone without a custom popup. */
function InlineSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const current = options.find((option) => option.value === value)?.label ?? "";
  return (
    <label className="inline-select">
      <span aria-hidden="true">
        {label}: {current}
      </span>
      <span className="ms" aria-hidden="true">
        arrow_drop_down
      </span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * /experts (website design). The real published directory, already ranked
 * by activity (049c); category, format and price filters run in the
 * browser. "Match me" hands the description to /match.
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
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(
    initialCategory && categories.includes(initialCategory) ? initialCategory : null,
  );
  const [format, setFormat] = useState<FormatFilter>("any");
  const [price, setPrice] = useState<PriceFilter>("any");
  const [sort, setSort] = useState<SortKey>("best");
  const [shown, setShown] = useState(PAGE_SIZE);

  const results = useMemo(() => {
    const list = experts.filter(
      (expert) =>
        matchesText(expert, query) &&
        (!category || expert.categoryNames.includes(category)) &&
        (format === "any" || (format === "online" ? expert.onlineEnabled : expert.inPersonEnabled)) &&
        withinPrice(expert.startingPrice, price),
    );
    if (sort === "best") return list;
    const direction = sort === "price-low" ? 1 : -1;
    return [...list].sort(
      (a, b) => direction * ((a.startingPrice ?? Infinity) - (b.startingPrice ?? Infinity)) || a.fullName.localeCompare(b.fullName),
    );
  }, [experts, query, category, format, price, sort]);

  function submitMatch(event: React.FormEvent) {
    event.preventDefault();
    const text = problem.trim();
    if (!text) {
      document.getElementById("q")?.focus();
      return;
    }
    router.push(`/match?problem=${encodeURIComponent(text)}`);
  }

  function pickCategory(name: string | null) {
    setCategory(name);
    setShown(PAGE_SIZE);
  }

  const countLabel =
    `${results.length} ${results.length === 1 ? "expert" : "experts"}` + (category ? ` in ${category.toLowerCase()}` : "");

  return (
    <>
      <section style={{ background: "#f4f5f7" }}>
        <div className="wrap stack" style={{ paddingBlock: "72px 56px", gap: 32 }}>
          <div className="stack" style={{ gap: 12 }}>
            <h1 className="h1">Find an expert</h1>
            <p className="lede">
              Describe what you&apos;re facing and we&apos;ll rank experts by how close their experience is. Or filter
              the list yourself.
            </p>
          </div>
          <form className="matchbar" onSubmit={submitMatch}>
            <label htmlFor="q" className="sr">
              Describe your problem
            </label>
            <div className="box">
              <span className="ms" aria-hidden="true">
                search
              </span>
              <input
                id="q"
                type="text"
                maxLength={1000}
                value={problem}
                onChange={(event) => setProblem(event.target.value)}
                placeholder="e.g. Expanding a restaurant to a second branch"
              />
            </div>
            <button type="submit" className="btn btn-ink lg" style={{ height: 56 }}>
              Match me{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </button>
          </form>
        </div>
      </section>

      <section id="results" style={{ background: "#ffffff" }}>
        <div className="wrap stack" style={{ paddingBlock: "40px 128px", gap: 32 }}>
          {categories.length > 0 ? (
            <div className="scroller" role="group" aria-label="Filter by topic">
              {[null, ...categories].map((name) => (
                <button
                  key={name ?? "all"}
                  type="button"
                  className="chip"
                  aria-pressed={category === name}
                  onClick={() => pickCategory(name)}
                >
                  {name ?? "All"}
                </button>
              ))}
            </div>
          ) : null}

          <div className="filterbar">
            <span className="muted num" style={{ fontSize: 15 }}>
              {countLabel}
              {query ? (
                <>
                  {" "}
                  matching &ldquo;{query}&rdquo; ·{" "}
                  <button type="button" className="textbtn" onClick={() => setQuery("")}>
                    Clear
                  </button>
                </>
              ) : null}
            </span>
            <div className="selects">
              <InlineSelect
                label="Format"
                value={format}
                onChange={setFormat}
                options={[
                  { value: "any", label: "any" },
                  { value: "online", label: "Google Meet" },
                  { value: "in_person", label: "In person" },
                ]}
              />
              <InlineSelect
                label="Price"
                value={price}
                onChange={setPrice}
                options={(Object.keys(PRICE_LABELS) as PriceFilter[]).map((key) => ({
                  value: key,
                  label: PRICE_LABELS[key],
                }))}
              />
              <InlineSelect
                label="Sort"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "best", label: "best match" },
                  { value: "price-low", label: "price, low to high" },
                  { value: "price-high", label: "price, high to low" },
                ]}
              />
            </div>
          </div>

          {results.length > 0 ? (
            <div className="xgrid">
              {results.slice(0, shown).map((expert) => (
                <ExpertCard key={expert.slug} expert={expert} showFormat />
              ))}
            </div>
          ) : (
            <div className="stack" style={{ gap: 8, alignItems: "center", paddingBlock: 48, textAlign: "center" }}>
              <span className="d" style={{ fontSize: 22 }}>
                {experts.length === 0 ? "We're adding experts now" : "No experts match these filters"}
              </span>
              <span className="muted">
                {experts.length === 0
                  ? "The first vetted experts are being onboarded. Check back soon."
                  : "Try another topic, or describe your problem above and we'll match you."}
              </span>
            </div>
          )}

          {results.length > shown ? (
            <div style={{ display: "flex", justifyContent: "center", paddingBlockStart: 24 }}>
              <button type="button" className="btn btn-line md even" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                Show more experts
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
