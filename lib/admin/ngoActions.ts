"use server";

import { revalidatePath } from "next/cache";
import { invalidatePublicExperts } from "@/lib/public/cached";
import { createClient } from "@/lib/supabase/server";
import { requireAdminForAction } from "@/lib/admin/data";
import type { AdminActionState } from "@/lib/admin/actions";

function cleanName(value: FormDataEntryValue | null): { name: string } | { error: string } {
  const name = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 2) return { error: "Enter the organisation's name." };
  if (name.length > 160) return { error: "Keep the name under 160 characters." };
  return { name };
}

function refresh() {
  revalidatePath("/admin/ngos");
  revalidatePath("/expert/application/sessions");
  invalidatePublicExperts();
}

/** Admin: add an NGO experts can choose. */
export async function addNgoAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };
  const parsed = cleanName(formData.get("name"));
  if ("error" in parsed) return { error: parsed.error };

  const { error } = await supabase.from("ngos").insert({ name: parsed.name, created_by: auth.admin.id });
  if (error) {
    return { error: error.code === "23505" ? "That organisation is already on the list." : "Couldn't add it. Try again." };
  }
  refresh();
  return { success: true };
}

/** Admin: correct an NGO's name. Experts who chose it keep it. */
export async function renameNgoAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };
  const id = String(formData.get("id") ?? "");
  const parsed = cleanName(formData.get("name"));
  if ("error" in parsed) return { error: parsed.error };

  const { error } = await supabase.from("ngos").update({ name: parsed.name }).eq("id", id);
  if (error) {
    return { error: error.code === "23505" ? "Another organisation already has that name." : "Couldn't save. Try again." };
  }
  refresh();
  return { success: true };
}

/** Admin: hide an NGO (experts can't choose it and profiles stop showing it) or show it again. */
export async function setNgoActiveAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return;
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  await supabase.from("ngos").update({ is_active: active }).eq("id", id);
  refresh();
}
