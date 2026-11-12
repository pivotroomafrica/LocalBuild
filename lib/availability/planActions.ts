"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { planProblem, type AvailabilityPlan } from "@/lib/availability/plan";

/** Messages set_expert_availability_plan() raises on purpose (060); any
 * other database error is shown as the generic one. */
const KNOWN = ["hours a month", "weekdays or dates", "at least one", "too many days", "isn't valid", "overlap", "15-minute", "end time", "no expert profile"];

/** Save the expert's monthly plan (hours, days, times) in one go. */
export async function saveAvailabilityPlanAction(plan: AvailabilityPlan): Promise<{ error?: string }> {
  const problem = planProblem(plan);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const { error } = await supabase.rpc("set_expert_availability_plan", {
    p_monthly_hours: plan.hours!,
    p_mode: plan.mode,
    p_days: plan.days,
    p_windows: plan.windows,
  });
  if (error) {
    const message = error.message ?? "";
    return {
      error: KNOWN.some((k) => message.toLowerCase().includes(k))
        ? message
        : "We couldn't save your availability. Please try again.",
    };
  }

  revalidatePath("/expert/availability");
  return {};
}
