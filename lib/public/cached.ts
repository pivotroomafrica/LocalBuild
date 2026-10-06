import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getExpertCategories, getPublicExpertDirectory } from "@/lib/public/data";

// Per-request memoization: the (public) layout (search modal, footer) and the
// page itself both need these, and the directory signs a photo URL per
// expert -- without cache() every public page view would do that twice.
export const getDirectoryForRequest = cache(async () => getPublicExpertDirectory(await createClient()));

export const getCategoryNamesForRequest = cache(async () =>
  (await getExpertCategories(await createClient())).map((category) => category.name),
);
