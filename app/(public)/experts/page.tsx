import { createClient } from "@/lib/supabase/server";
import { getPublicExpertDirectory, getExpertCategories } from "@/lib/public/data";
import { Container } from "@/components/ui/Container";
import { ExpertsBrowseClient } from "@/components/experts/ExpertsBrowseClient";

export const metadata = { title: "Browse experts — Pivotroom" };

type Props = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

/**
 * `q` (from the header search, and the homepage hero/final-CTA
 * ProblemInput) and `category` (exact match, from the homepage
 * ProblemDiscovery links) both seed ExpertsBrowseClient's own filter
 * state -- a shared link still pre-filters correctly, but every further
 * refinement (price, sort, view mode, a broader in-page search) happens
 * client-side without a round trip. One server-side fetch of the real,
 * published-only directory plus the real category taxonomy -- no second
 * data source, no invented categories.
 */
export default async function ExpertDirectoryPage({ searchParams }: Props) {
  const { q, category } = await searchParams;
  const supabase = await createClient();
  const [experts, categories] = await Promise.all([
    getPublicExpertDirectory(supabase),
    getExpertCategories(supabase),
  ]);

  return (
    <Container className="flex flex-col gap-10 py-10 sm:py-16">
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">Browse experts</h1>
        <p className="mt-2 max-w-xl text-base text-[var(--color-text-muted)]">
          Book one-to-one time with people who&apos;ve already done what you&apos;re trying to do.
        </p>
      </div>

      {experts.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
          <p className="text-base font-medium text-[var(--color-text)]">No experts on Pivotroom yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
            We&apos;re adding people. Check back soon.
          </p>
        </div>
      ) : (
        <ExpertsBrowseClient
          experts={experts}
          categories={categories.map((c) => c.name)}
          initialQuery={q ?? ""}
          initialCategory={category ?? null}
        />
      )}
    </Container>
  );
}
