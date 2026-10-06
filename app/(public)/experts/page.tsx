import { getCategoryNamesForRequest, getDirectoryForRequest } from "@/lib/public/cached";
import { ExpertsDirectoryClient } from "@/components/site/ExpertsDirectoryClient";

export const metadata = { title: "Browse experts — Pivotroom" };

type Props = {
  searchParams: Promise<{ q?: string; category?: string }>;
};

/** `q` (header search) and `category` (footer / category links) seed the
 * directory's own filter state, so shared links still land pre-filtered. */
export default async function ExpertDirectoryPage({ searchParams }: Props) {
  const { q, category } = await searchParams;
  const [experts, categories] = await Promise.all([getDirectoryForRequest(), getCategoryNamesForRequest()]);

  return (
    <ExpertsDirectoryClient
      experts={experts}
      categories={categories}
      initialQuery={q ?? ""}
      initialCategory={category ?? null}
    />
  );
}
