"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateAvailabilityWindows } from "@/lib/availability/engine";
import type { AvailabilityWindowInput } from "@/types/availability";

export type AvailabilityActionState = {
  error?: string;
  success?: boolean;
};

const GENERIC_ERROR = "We couldn't save your availability. Please try again.";

/**
 * Thin wrapper around the save_expert_availability_schedule() RPC
 * (021_expert_availability_functions.sql). Deliberately takes only
 * (timezone, windows) -- never expert_profile_id or user_id (spec
 * section 31) -- the RPC resolves the caller's own approved expert
 * profile from auth.uid() itself. This is a direct callable Server
 * Action (invoked from a client component, not bound to a <form
 * action={}>), because the weekly schedule is a dynamic multi-row list
 * that doesn't map cleanly onto FormData.
 *
 * Client-side validateAvailabilityWindows() runs first purely for a fast,
 * specific error message -- the RPC re-validates everything itself
 * regardless, so a bug here can never let an invalid schedule through.
 */
export async function saveAvailabilityScheduleAction(
  timezone: string,
  windows: AvailabilityWindowInput[],
): Promise<AvailabilityActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  if (!timezone.trim()) return { error: "Please choose a timezone." };

  const clientCheck = validateAvailabilityWindows(windows);
  if (!clientCheck.valid) return { error: clientCheck.error };

  const { error } = await supabase.rpc("save_expert_availability_schedule", {
    p_timezone: timezone,
    p_windows: windows,
  });

  if (error) {
    // The RPC's own validation messages (invalid timezone, bad grid,
    // overlap, etc.) are safe, specific, and meant to be shown as-is --
    // never a raw Postgres/connection error, which falls back to the
    // generic message instead (spec section 37: "do not expose raw
    // PostgreSQL/Supabase errors").
    const message = error.message ?? "";
    const isKnownValidationError =
      message.includes("timezone") ||
      message.includes("day_of_week") ||
      message.includes("start_time") ||
      message.includes("end_time") ||
      message.includes("overlap") ||
      message.includes("approved expert profile");
    return { error: isKnownValidationError ? message : GENERIC_ERROR };
  }

  revalidatePath("/expert/availability");
  return { success: true };
}

export async function addUnavailableDateAction(dateString: string): Promise<AvailabilityActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return { error: "Please choose a valid date." };
  }

  const { error } = await supabase.rpc("add_expert_unavailable_date", { p_date: dateString });
  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/expert/availability");
  return { success: true };
}

export async function removeUnavailableDateAction(dateString: string): Promise<AvailabilityActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const { error } = await supabase.rpc("remove_expert_unavailable_date", { p_date: dateString });
  if (error) return { error: GENERIC_ERROR };

  revalidatePath("/expert/availability");
  return { success: true };
}
