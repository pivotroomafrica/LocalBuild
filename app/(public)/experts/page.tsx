import { getCategoryNamesForRequest, getDirectoryForRequest } from "@/lib/public/cached";
import { ExpertsDirectoryClient } from "@/components/site/ExpertsDirectoryClient";

export const metadata = { title: "Browse experts — Pivotroom" };

type Props = {
  searchParams: Promise<{ q?: string; category?: string; topic?: string }>;
};

/** `q` (header search), `category` (footer / category links) and `topic`
 * (home page topic chips) seed the
 * directory's own filter state, so shared links still land pre-filtered. */
export default async function ExpertDirectoryPage({ searchParams }: Props) {
  const { q, category, topic } = await searchParams;
  const [experts, categories] = await Promise.all([getDirectoryForRequest(), getCategoryNamesForRequest()]);

  return (
    <ExpertsDirectoryClient
      experts={experts}
      categories={categories}
      initialQuery={q ?? ""}
      initialCategory={category ?? null}
      initialTopic={topic ?? null}
    />
  );
}
