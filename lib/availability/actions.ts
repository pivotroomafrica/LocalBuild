"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateTimeRange } from "@/lib/availability/engine";
import type { MonthlyRuleInput, OneOffAvailabilityInput, OverrideType } from "@/types/availability";

export type AvailabilityActionState = {
  error?: string;
  success?: boolean;
  id?: string;
};

const GENERIC_ERROR = "We couldn't save your availability. Please try again.";

/**
 * The RPCs (030_expert_monthly_availability_final_functions.sql,
 * 026_expert_availability_timezone_function.sql) raise clean,
 * safe-to-display messages for every validation failure they know about
 * -- overlap, the monthly cap, an invalid timezone, bad increments. Only
 * a truly unexpected error (connection issue, a bug) falls back to the
 * generic message, so a raw Postgres error is never shown.
 */
function toSafeError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR;
  const knownFragments = [
    "timezone",
    "day_of_month",
    "start time",
    "end time",
    "overlap",
    "5 hours",
    "availability limit",
    "date is required",
    "occurrence does not belong",
    "override_type",
    "approved expert profile",
    "not found",
  ];
  return knownFragments.some((fragment) => message.toLowerCase().includes(fragment)) ? message : GENERIC_ERROR;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidateAvailabilityPage() {
  revalidatePath("/expert/availability");
}

export async function setTimezoneAction(timezone: string): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };
  if (!timezone.trim()) return { error: "Please choose a timezone." };

  const { error } = await supabase.rpc("set_expert_availability_timezone", { p_timezone: timezone });
  if (error) return { error: toSafeError(error.message) };

  revalidateAvailabilityPage();
  return { success: true };
}

function clientValidateTimeRange(input: { start_time: string; end_time: string }): string | null {
  const timeCheck = validateTimeRange(input.start_time, input.end_time);
  return timeCheck.valid ? null : timeCheck.error;
}

export async function addMonthlyRuleAction(rule: MonthlyRuleInput): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };

  const clientError = clientValidateTimeRange(rule);
  if (clientError) return { error: clientError };

  const { data, error } = await supabase.rpc("add_expert_monthly_rule", {
    p_day_of_month: rule.day_of_month,
    p_start_time: rule.start_time,
    p_end_time: rule.end_time,
  });
  if (error) return { error: toSafeError(error.message) };

  revalidateAvailabilityPage();
  return { success: true, id: data ?? undefined };
}

export async function updateMonthlyRuleAction(
  ruleId: string,
  rule: MonthlyRuleInput,
): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };

  const clientError = clientValidateTimeRange(rule);
  if (clientError) return { error: clientError };

  const { error } = await supabase.rpc("update_expert_monthly_rule", {
    p_rule_id: ruleId,
    p_day_of_month: rule.day_of_month,
    p_start_time: rule.start_time,
    p_end_time: rule.end_time,
  });
  if (error) return { error: toSafeError(error.message) };

  revalidateAvailabilityPage();
  return { success: true };
}

export async function removeMonthlyRuleAction(ruleId: string): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };

  const { error } = await supabase.rpc("remove_expert_monthly_rule", { p_rule_id: ruleId });
  if (error) return { error: GENERIC_ERROR };

  revalidateAvailabilityPage();
  return { success: true };
}

/**
 * "Edit this month" / "Add extra time" (override_type "modified") or
 * "Skip this month" (override_type "skipped") for one specific
 * occurrence of a recurring rule -- the base rule itself is never
 * touched (set_expert_month_override() upserts on
 * (recurring_rule_id, original_date)).
 */
export async function setMonthOverrideAction(input: {
  recurringRuleId: string;
  originalDate: string;
  overrideType: OverrideType;
  overrideDate?: string;
  startTime?: string;
  endTime?: string;
}): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };

  if (input.overrideType === "modified") {
    if (!input.overrideDate) return { error: "Please choose a date." };
    const clientError = clientValidateTimeRange({
      start_time: input.startTime ?? "",
      end_time: input.endTime ?? "",
    });
    if (clientError) return { error: clientError };
  }

  const { data, error } = await supabase.rpc("set_expert_month_override", {
    p_recurring_rule_id: input.recurringRuleId,
    p_original_date: input.originalDate,
    p_override_type: input.overrideType,
    p_override_date: input.overrideType === "modified" ? input.overrideDate : undefined,
    p_start_time: input.overrideType === "modified" ? input.startTime : undefined,
    p_end_time: input.overrideType === "modified" ? input.endTime : undefined,
  });
  if (error) return { error: toSafeError(error.message) };

  revalidateAvailabilityPage();
  return { success: true, id: data ?? undefined };
}

/** "Restore Regular Time" -- removes the override for one occurrence so
 * it reverts to the base rule's natural date/time. */
export async function removeMonthOverrideAction(overrideId: string): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };

  const { error } = await supabase.rpc("remove_expert_month_override", { p_override_id: overrideId });
  if (error) return { error: GENERIC_ERROR };

  revalidateAvailabilityPage();
  return { success: true };
}

export async function addOneOffAvailabilityAction(
  input: OneOffAvailabilityInput,
): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };
  if (!input.available_date) return { error: "Please choose a date." };

  const clientError = clientValidateTimeRange(input);
  if (clientError) return { error: clientError };

  const { data, error } = await supabase.rpc("add_expert_one_off_availability", {
    p_available_date: input.available_date,
    p_start_time: input.start_time,
    p_end_time: input.end_time,
  });
  if (error) return { error: toSafeError(error.message) };

  revalidateAvailabilityPage();
  return { success: true, id: data ?? undefined };
}

export async function updateOneOffAvailabilityAction(
  id: string,
  input: OneOffAvailabilityInput,
): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };
  if (!input.available_date) return { error: "Please choose a date." };

  const clientError = clientValidateTimeRange(input);
  if (clientError) return { error: clientError };

  const { error } = await supabase.rpc("update_expert_one_off_availability", {
    p_id: id,
    p_available_date: input.available_date,
    p_start_time: input.start_time,
    p_end_time: input.end_time,
  });
  if (error) return { error: toSafeError(error.message) };

  revalidateAvailabilityPage();
  return { success: true };
}

export async function removeOneOffAvailabilityAction(id: string): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };

  const { error } = await supabase.rpc("remove_expert_one_off_availability", { p_id: id });
  if (error) return { error: GENERIC_ERROR };

  revalidateAvailabilityPage();
  return { success: true };
}
