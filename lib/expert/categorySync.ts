import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { MAX_EXPERT_CATEGORIES } from "@/types/expert";

/**
 * Makes an expert's categories exactly `ids` (max 3, also enforced by
 * enforce_expert_category_limit() in the database). Used by the expert's
 * own onboarding (RLS: own rows) and by the admin editor (RLS: admin
 * policies from 050). Returns an error message, or null on success.
 */
export async function syncExpertCategories(
  supabase: SupabaseClient<Database>,
  expertProfileId: string,
  ids: string[],
): Promise<string | null> {
  const wanted = Array.from(new Set(ids.filter(Boolean)));
  if (wanted.length > MAX_EXPERT_CATEGORIES) return `Pick at most ${MAX_EXPERT_CATEGORIES} areas.`;

  const { data: existing, error: readError } = await supabase
    .from("expert_profile_categories")
    .select("id, category_id")
    .eq("expert_profile_id", expertProfileId);
  if (readError) return "We couldn't save the areas. Please try again.";

  const have = new Set((existing ?? []).map((row) => row.category_id));
  const remove = (existing ?? []).filter((row) => !wanted.includes(row.category_id));
  const add = wanted.filter((id) => !have.has(id));

  if (remove.length > 0) {
    const { error } = await supabase
      .from("expert_profile_categories")
      .delete()
      .in(
        "id",
        remove.map((row) => row.id),
      );
    if (error) return "We couldn't save the areas. Please try again.";
  }
  if (add.length > 0) {
    const { error } = await supabase
      .from("expert_profile_categories")
      .insert(add.map((categoryId) => ({ expert_profile_id: expertProfileId, category_id: categoryId })));
    if (error) {
      return error.message.includes("at most 3")
        ? `Pick at most ${MAX_EXPERT_CATEGORIES} areas.`
        : "We couldn't save the areas. Please try again.";
    }
  }
  return null;
}
