"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireAdminForAction } from "@/lib/admin/data";
import { getAdminPerson } from "@/lib/admin/people";
import { getDeletionImpact } from "@/lib/admin/deletePerson";
import { invalidatePublicExperts } from "@/lib/public/cached";
import type { AdminActionState } from "@/lib/admin/actions";

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Permanently delete a client or expert and everything tied to them
 * (login, profile, expert profile, availability, bookings on both sides,
 * payments, reviews, receipt requests, uploaded files).
 *
 * Refused for admins, for the admin's own account, and while the person
 * has an upcoming session (someone is expecting it: cancel it first). The
 * admin must type the person's full name; the server checks it again.
 */
export async function adminDeletePersonAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const userId = String(formData.get("user_id") ?? "");
  const typed = String(formData.get("confirm_name") ?? "");
  if (!userId) return { error: "Missing person." };
  if (userId === auth.admin.id) return { error: "You can't delete your own account." };

  const person = await getAdminPerson(supabase, userId);
  if (!person) return { error: "That account no longer exists." };
  if (person.role === "admin") return { error: "Admin accounts can't be deleted here." };
  if (!person.full_name || normalize(typed) !== normalize(person.full_name)) {
    return { error: "Type their full name exactly to confirm." };
  }

  const service = createServiceRoleClient();
  const impact = await getDeletionImpact(service, userId, person.expert_profile_id);
  if (impact.upcoming.length > 0) {
    return {
      error: `They have ${impact.upcoming.length} upcoming ${
        impact.upcoming.length === 1 ? "session" : "sessions"
      } (${impact.upcoming.map((u) => u.reference).join(", ")}). Cancel ${
        impact.upcoming.length === 1 ? "it" : "them"
      } first, then delete.`,
    };
  }

  // Deleting the login cascades through every table tied to it.
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) {
    console.error("adminDeletePersonAction: deleteUser failed", error.message);
    return { error: "We couldn't delete this account. Nothing was removed. Please try again." };
  }

  // Files don't cascade: remove them now (best effort; the account is gone
  // either way and the files are in private buckets).
  const byBucket = new Map<string, string[]>();
  for (const { bucket, path } of impact.paths) byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
  for (const [bucket, paths] of byBucket) {
    const { error: removeError } = await service.storage.from(bucket).remove(paths);
    if (removeError) console.error(`adminDeletePersonAction: couldn't remove files from ${bucket}`, removeError.message);
  }

  if (person.expert_profile_id) invalidatePublicExperts();
  revalidatePath("/admin", "layout");
  redirect(`/admin/people?tab=${person.expert_profile_id ? "experts" : "clients"}&deleted=1`);
}
