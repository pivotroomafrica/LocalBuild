import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "@/types/database";
import { calculateDurationPrice } from "@/lib/expert/pricing";
import type { SessionDuration } from "@/types/expert";

/**
 * Writes an expert's validated pricing configuration: the 60-minute base
 * rate and formats on expert_profiles, plus one derived
 * expert_session_types row per enabled duration (synchronized, not
 * accumulated). Shared by the classic sessions form
 * (saveSessionPricingAction) and the guided onboarding.
 *
 * Update-then-insert-if-none per duration (not .upsert()) so this never
 * needs to touch expert_profile_id in an UPDATE's SET clause -- that column
 * is deliberately outside the UPDATE grant in 010_expert_rls.sql. Returns
 * true on success.
 */
export async function syncSessionPricing(
  supabase: SupabaseClient<Database>,
  userId: string,
  {
    basePrice,
    durations,
    onlineEnabled,
    inPersonEnabled,
    extraUpdate = {},
  }: {
    basePrice: number;
    durations: SessionDuration[];
    onlineEnabled: boolean;
    inPersonEnabled: boolean;
    extraUpdate?: TablesUpdate<"expert_profiles">;
  },
): Promise<boolean> {
  const { data: expertProfile } = await supabase.from("expert_profiles").select("id").eq("user_id", userId).single();
  if (!expertProfile) return false;

  const { error: profileError } = await supabase
    .from("expert_profiles")
    .update({
      base_hourly_price: basePrice,
      online_enabled: onlineEnabled,
      in_person_enabled: inPersonEnabled,
      ...extraUpdate,
    })
    .eq("user_id", userId);
  if (profileError) return false;

  for (const duration of durations) {
    const derivedPrice = calculateDurationPrice(basePrice, duration);

    const { data: updatedRows, error: updateError } = await supabase
      .from("expert_session_types")
      .update({
        base_price: derivedPrice,
        currency: "ETB",
        online_enabled: onlineEnabled,
        in_person_enabled: inPersonEnabled,
      })
      .eq("expert_profile_id", expertProfile.id)
      .eq("duration_minutes", duration)
      .select("id");
    if (updateError) return false;

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertError } = await supabase.from("expert_session_types").insert({
        expert_profile_id: expertProfile.id,
        duration_minutes: duration,
        base_price: derivedPrice,
        currency: "ETB",
        online_enabled: onlineEnabled,
        in_person_enabled: inPersonEnabled,
      });
      // A concurrent duplicate insert hits the unique (expert_profile_id,
      // duration_minutes) constraint: the row already exists, not a failure.
      if (insertError && insertError.code !== "23505") return false;
    }
  }

  const { error: deleteError } = await supabase
    .from("expert_session_types")
    .delete()
    .eq("expert_profile_id", expertProfile.id)
    .not("duration_minutes", "in", `(${durations.join(",")})`);
  return !deleteError;
}
