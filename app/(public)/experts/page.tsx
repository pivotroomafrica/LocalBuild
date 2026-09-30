import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPublicExpertDirectory } from "@/lib/public/data";
import { Container } from "@/components/ui/Container";
import { ExpertCard } from "@/components/expert/ExpertCard";

export const metadata = { title: "Browse experts — Pivotroom" };

type Props = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

/**
 * `q` (from the header search, and the homepage hero/final-CTA
 * ProblemInput) and `category` (exact match, from the homepage
 * ProblemDiscovery links) both filter the SAME already-fetched,
 * published-only list client-side -- no second query, no new DB shape.
 * `q` matches expert name only for now (see the filter below) -- not
 * headline/position/company/category, since the header search is
 * explicitly scoped to name search only at this stage. This is
 * intentionally logic-only: the visual design of this page is out of
 * scope for the homepage redesign (spec section 26 treats it as a
 * separate "utility mode" pass), so the grid/cards below are untouched;
 * only the entry points from the new homepage sections and header needed
 * a real destination instead of a dead link.
 */
export default async function ExpertDirectoryPage({ searchParams }: Props) {
  const { q, category } = await searchParams;
  const supabase = await createClient();
  const allExperts = await getPublicExpertDirectory(supabase);

  const needle = q?.trim().toLowerCase();
  const experts = allExperts.filter((expert) => {
    if (category && !expert.categoryNames.includes(category)) return false;
    if (!needle) return true;
    // Name-only for now (per the header search's own scope) -- headline/
    // position/company/category matching can come later once there's a
    // reason to widen it, but a name search should never silently start
    // matching unrelated fields.
    return expert.fullName.toLowerCase().includes(needle);
  });

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
          <p className="text-base font-medium text-[var(--color-text)]">
            {allExperts.length === 0 ? "No experts on Pivotroom yet" : "No experts match that yet"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
            {allExperts.length === 0 ? (
              "We're adding people. Check back soon."
            ) : (
              <>
                Try{" "}
                <Link href="/experts" className="underline underline-offset-2 hover:text-[var(--color-text)]">
                  browsing everyone
                </Link>{" "}
                instead.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {experts.map((expert) => (
            <ExpertCard key={expert.slug} expert={expert} />
          ))}
        </div>
      )}
    </Container>
  );
}
