import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Where a signed-in person lands when no specific page was asked for:
 * admins on the admin overview, approved experts on their dashboard,
 * everyone else on their client dashboard. */
export async function homePathFor(supabase: SupabaseClient<Database>, userId: string): Promise<string> {
  const [{ data: profile }, { data: expert }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.from("expert_profiles").select("application_status").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile?.role === "admin") return "/admin";
  if (expert?.application_status === "approved") return "/expert/dashboard";
  return "/dashboard";
}

/** A same-site path from a `next` parameter, or null when none was given. */
export function safeNext(value: unknown): string | null {
  const next = typeof value === "string" ? value.trim() : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}
