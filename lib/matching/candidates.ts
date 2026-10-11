import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import { describeSupabaseError } from "@/lib/supabase/errors";
import { PUBLIC_EXPERTS_TAG } from "@/lib/public/cache-tags";

/** Compact, already-public summary of one published expert, as sent to
 * the model (get_expert_match_candidates_public, migration 048). */
export type MatchCandidate = {
  slug: string;
  fullName: string;
  headline: string | null;
  role: string | null;
  categories: string[];
  expertise: string | null;
  helpsWith: string | null;
  whoTheyHelp: string | null;
};

/** Shared with the public directory cache: invalidated by the same tag
 * whenever a public profile changes. Throws on failure (never cached). */
export const loadMatchCandidates = unstable_cache(
  async (): Promise<MatchCandidate[]> => {
    const { data, error } = await createAnonClient().rpc("get_expert_match_candidates_public", undefined, {
      get: true,
    });
    if (error) throw new Error(`failed to load match candidates: ${describeSupabaseError(error)}`);
    return (data ?? []).map((row) => ({
      slug: row.slug,
      fullName: row.full_name ?? "",
      headline: row.headline ?? null,
      role: [row.current_position, row.current_company].filter(Boolean).join(" at ") || null,
      categories: row.category_names ?? [],
      expertise: row.expertise_summary ?? null,
      helpsWith: row.problems_help_with ?? null,
      whoTheyHelp: row.who_i_help ?? null,
    }));
  },
  ["ai-match-candidates"],
  { revalidate: 600, tags: [PUBLIC_EXPERTS_TAG] },
);
