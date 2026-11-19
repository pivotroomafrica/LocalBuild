"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminForAction } from "@/lib/admin/data";
import { forgetWaitlistMode } from "@/lib/waitlist/gate";

export type WaitlistSwitchState = { error?: string; on?: boolean };

/** Admin: turn waitlist mode on or off (070's set_waitlist_mode checks
 * admin again in the database). */
export async function setWaitlistModeAction(_prev: WaitlistSwitchState, formData: FormData): Promise<WaitlistSwitchState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: "Only admins can change this." };
  const on = formData.get("on") === "true";
  const { error } = await supabase.rpc("set_waitlist_mode", { p_on: on });
  if (error) {
    console.error("setWaitlistModeAction:", error.message);
    return { error: "That didn't save. Please try again." };
  }
  forgetWaitlistMode();
  revalidatePath("/admin/waitlist");
  return { on };
}
