import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/marketing/Reveal";
import type { ExpertCategorySummary } from "@/lib/public/data";

/**
 * A problem-phrased DISPLAY label for each real expert_categories row --
 * the category names themselves ("Funding, Investment & Finance") are
 * accurate but not written as a problem statement, and the spec (section
 * 19) explicitly wants "Raise capital", not a category-name grid. This
 * maps display wording only; the link still filters by the real,
 * unmodified category name (see /experts?category=), so nothing about the
 * underlying taxonomy is invented -- only how one line of it reads here.
 * A category that shows up in the database without an entry here still
 * renders (falls back to its own name) rather than silently vanishing.
 */
const PROBLEM_LABELS: Record<string, string> = {
  "Funding, Investment & Finance": "Raise capital",
  "Sales, Partnership & Expansion": "Grow sales and partnerships",
  "Starting & Building a Business": "Start or build a business",
  "Leadership, Management & Operations": "Fix operations and leadership",
  "Marketing, Brand & Growth": "Grow your brand",
  "Product, Technology & AI": "Ship product and adopt AI",
  "Industry & Specialized Expertise": "Get specialized industry insight",
  "Career & Professional": "Plan your next career move",
};

/**
 * "What are you trying to solve?" (spec section 19) -- a typographic
 * discovery interface, not a grid of icon cards. Each row is a real
 * problem drawn from the real expert_categories taxonomy (no invented
 * problems, no fake counts), linking to the SAME /experts?category= filter
 * ProblemInput's `q` param and MeetOurExperts' "View all experts" share.
 */
export function ProblemDiscovery({ categories }: { categories: ExpertCategorySummary[] }) {
  if (categories.length === 0) return null;

  return (
    <section className="py-20 sm:py-28 lg:py-36">
      <Container>
        <Reveal>
          <h2 className="font-display max-w-lg text-[32px] font-bold leading-[1.1] tracking-[-0.015em] text-[var(--color-text)] sm:text-[42px] lg:text-[48px]">
            What are you trying
            <br />
            to solve?
          </h2>
        </Reveal>

        <Reveal delayMs={100}>
          <ul className="mt-12 max-w-2xl border-t border-[var(--color-border)] sm:mt-16">
            {categories.map((category, index) => (
              <li key={category.name} className="border-b border-[var(--color-border)]">
                <Link
                  href={`/experts?category=${encodeURIComponent(category.name)}`}
                  className="group flex items-center justify-between gap-4 py-5 transition-colors hover:bg-[var(--color-mist)] sm:py-6"
                >
                  <span className="flex items-baseline gap-4 sm:gap-6">
                    <span className="tabular-nums-brand text-xs text-[var(--color-text-muted)] sm:text-sm">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-display text-lg font-bold text-[var(--color-text)] transition-transform duration-300 group-hover:translate-x-1.5 sm:text-2xl">
                      {PROBLEM_LABELS[category.name] ?? category.name}
                    </span>
                  </span>
                  <Icon
                    name="arrow_forward"
                    size={24}
                    className="shrink-0 text-[var(--color-text-muted)] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[var(--color-text)]"
                    decorative
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
