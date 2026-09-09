import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  ExpertAvailabilityOverride,
  ExpertAvailabilitySettings,
  ExpertMonthlyAvailabilityRule,
  ExpertOneOffAvailability,
} from "@/types/availability";

type TypedClient = SupabaseClient<Database>;

/**
 * Server-side authorization for /expert/availability. proxy.ts already
 * requires a session for every /expert/* path; this is the "and
 * application_status = approved" half. RLS
 * (029_expert_monthly_availability_final_rls.sql, and 020_expert_
 * availability_rls.sql for the reused settings table) is the layer that
 * holds even if this check had a bug: every read/write below is
 * additionally scoped to the same approved-owner condition at the
 * database level.
 *
 * Not approved (draft/submitted/changes_requested/rejected) -> redirect
 * to /expert/application rather than expose any availability UI or error
 * detail. ready/published/suspended are all fine, as long as
 * application_status is still 'approved.'
 */
export async function requireApprovedExpertPage(
  supabase: TypedClient,
): Promise<{ expertProfileId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/expert/availability");

  const { data: expertProfile } = await supabase
    .from("expert_profiles")
    .select("id, application_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!expertProfile || expertProfile.application_status !== "approved") {
    redirect("/expert/application");
  }

  return { expertProfileId: expertProfile.id };
}

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
