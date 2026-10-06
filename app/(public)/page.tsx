import { getCategoryNamesForRequest, getDirectoryForRequest } from "@/lib/public/cached";
import { HomeClient } from "@/components/site/HomeClient";

/** Home -- the real published-only directory and category taxonomy (shared,
 * per-request, with the layout's search modal and footer). */
export default async function Home() {
  const [experts, categories] = await Promise.all([getDirectoryForRequest(), getCategoryNamesForRequest()]);

  return <HomeClient experts={experts} categories={categories} />;
}
