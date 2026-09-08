"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateTimeRange } from "@/lib/availability/engine";
import type { MonthlyRuleInput, OneOffAvailabilityInput } from "@/types/availability";

export type AvailabilityActionState = {
  error?: string;
  success?: boolean;
  id?: string;
};

const GENERIC_ERROR = "We couldn't save your availability. Please try again.";

/**
 * The RPCs (025_expert_monthly_availability_functions.sql,
 * 026_expert_availability_timezone_function.sql) raise clean,
 * safe-to-display messages for every validation failure they know about
 * -- overlap, the 5-hour cap, an invalid timezone, bad increments. Only
 * a truly unexpected error (connection issue, a bug) falls back to the
 * generic message, so a raw Postgres error is never shown (spec section
 * 37: "do not expose raw PostgreSQL/Supabase errors").
 */
function toSafeError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR;
  const knownFragments = [
    "timezone",
    "week_of_month",
    "day_of_week",
    "start time",
    "end time",
    "overlap",
    "5 hours",
    "date is required",
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

function clientValidateRule(rule: MonthlyRuleInput): string | null {
  const timeCheck = validateTimeRange(rule.start_time, rule.end_time);
  return timeCheck.valid ? null : timeCheck.error;
}

export async function addMonthlyRuleAction(rule: MonthlyRuleInput): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };

  const clientError = clientValidateRule(rule);
  if (clientError) return { error: clientError };

  const { data, error } = await supabase.rpc("add_expert_monthly_rule", {
    p_week_of_month: rule.week_of_month,
    p_day_of_week: rule.day_of_week,
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

  const clientError = clientValidateRule(rule);
  if (clientError) return { error: clientError };

  const { error } = await supabase.rpc("update_expert_monthly_rule", {
    p_rule_id: ruleId,
    p_week_of_month: rule.week_of_month,
    p_day_of_week: rule.day_of_week,
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

export async function addOneOffAvailabilityAction(
  input: OneOffAvailabilityInput,
): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };
  if (!input.available_date) return { error: "Please choose a date." };

  const clientError = clientValidateRule({ ...input, week_of_month: "first", day_of_week: 1 });
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

  const clientError = clientValidateRule({ ...input, week_of_month: "first", day_of_week: 1 });
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

export async function addUnavailableDateAction(dateString: string): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return { error: "Please choose a valid date." };

  const { error } = await supabase.rpc("add_expert_unavailable_date", { p_date: dateString });
  if (error) return { error: GENERIC_ERROR };

  revalidateAvailabilityPage();
  return { success: true };
}

export async function removeUnavailableDateAction(dateString: string): Promise<AvailabilityActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "You must be logged in to do that." };

  const { error } = await supabase.rpc("remove_expert_unavailable_date", { p_date: dateString });
  if (error) return { error: GENERIC_ERROR };

  revalidateAvailabilityPage();
  return { success: true };
}
