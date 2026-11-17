import { getDirectoryForRequest } from "@/lib/public/cached";
import { HomeClient } from "@/components/site/HomeClient";

/** Home -- the real published-only directory (shared, per-request, with
 * the layout's search modal and footer). */
export default async function Home() {
  const experts = await getDirectoryForRequest();

  return <HomeClient experts={experts} />;
}
