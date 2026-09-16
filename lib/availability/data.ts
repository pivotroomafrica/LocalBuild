import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  ExpertAvailabilityOverride,
  ExpertAvailabilitySettings,
  ExpertMonthlyAvailabilityRule,
  ExpertOneOffAvailability,
} from "@/types/availability";

export { requireApprovedExpertPage } from "@/lib/expert/auth";

type TypedClient = SupabaseClient<Database>;

/** Every read below relies entirely on RLS to scope rows to the caller's
 * own approved expert profile -- there is no `.eq("expert_profile_id",
 * ...)` filter because none is needed: a plain select can only ever
 * return what RLS allows. */

export async function getExpertAvailabilitySettings(
  supabase: TypedClient,
): Promise<ExpertAvailabilitySettings | null> {
  const { data } = await supabase.from("expert_availability_settings").select("*").maybeSingle();
  return data;
}

export async function getExpertMonthlyAvailabilityRules(
  supabase: TypedClient,
): Promise<ExpertMonthlyAvailabilityRule[]> {
  const { data } = await supabase
    .from("expert_monthly_availability_rules")
    .select("*")
    .order("day_of_month")
    .order("start_time");
  return data ?? [];
}

export async function getExpertAvailabilityOverrides(
  supabase: TypedClient,
): Promise<ExpertAvailabilityOverride[]> {
  const { data } = await supabase
    .from("expert_availability_overrides")
    .select("*")
    .order("original_date");
  return data ?? [];
}

export async function getExpertOneOffAvailability(
  supabase: TypedClient,
): Promise<ExpertOneOffAvailability[]> {
  const { data } = await supabase
    .from("expert_one_off_availability")
    .select("*")
    .order("available_date")
    .order("start_time");
  return data ?? [];
}
