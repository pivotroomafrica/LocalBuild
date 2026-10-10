import { cache } from "react";
import { unstable_cache, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { describeSupabaseError } from "@/lib/supabase/errors";
import {
  fetchPublicExpertDirectory,
  fetchPublicExpertProfile,
  getExpertCategories,
  type PublicDirectoryCard,
  type PublicProfileData,
} from "@/lib/public/data";

/**
 * Shared server-side cache for PUBLIC expert data (V2, section 6).
 *
 * The directory and published profiles are identical for every visitor,
 * so they are loaded once with a cookie-less anon client and shared
 * across requests for up to PUBLIC_EXPERTS_REVALIDATE_SECONDS. Anything
 * that changes a public profile calls invalidatePublicExperts(), so edits,
 * publishing and suspensions show up on the next request rather than
 * after the window. Nothing user-specific ever goes through this cache.
 *
 * Failed loads throw inside the cached function (so a failure is never
 * cached) and are converted to an empty/not-found result outside it.
 */
export const PUBLIC_EXPERTS_TAG = "public-experts";
const PUBLIC_EXPERTS_REVALIDATE_SECONDS = 600;

const loadDirectory = unstable_cache(
  async () => fetchPublicExpertDirectory(createAnonClient()),
  ["public-expert-directory"],
  { revalidate: PUBLIC_EXPERTS_REVALIDATE_SECONDS, tags: [PUBLIC_EXPERTS_TAG] },
);

const loadProfile = unstable_cache(
  async (slug: string) => fetchPublicExpertProfile(createAnonClient(), slug),
  ["public-expert-profile"],
  { revalidate: PUBLIC_EXPERTS_REVALIDATE_SECONDS, tags: [PUBLIC_EXPERTS_TAG] },
);

/** Per-request memoized on top of the shared cache: the (public) layout's
 * search modal/footer and the page itself both read the directory. */
export const getDirectoryForRequest = cache(async (): Promise<PublicDirectoryCard[]> => {
  try {
    return await loadDirectory();
  } catch (error) {
    console.error(`getDirectoryForRequest: ${describeSupabaseError(error)}`);
    return [];
  }
});

export const getPublicProfileForRequest = cache(async (slug: string): Promise<PublicProfileData | null> => {
  try {
    return await loadProfile(slug);
  } catch (error) {
    console.error(`getPublicProfileForRequest: ${describeSupabaseError(error)}`);
    return null;
  }
});

// Categories stay per-request with the visitor's own client: the
// expert_categories RLS policy currently only lets signed-in users read
// them, so a shared anon-loaded copy would be empty for everyone.
export const getCategoryNamesForRequest = cache(async () =>
  (await getExpertCategories(await createClient())).map((category) => category.name),
);

/** Call from any Server Action that changes what a public profile shows
 * (publish/unpublish/suspend/restore, profile/photo/expertise/pricing
 * edits). updateTag expires the cache immediately (read-your-writes). */
export function invalidatePublicExperts() {
  updateTag(PUBLIC_EXPERTS_TAG);
}
