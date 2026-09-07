"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminForAction } from "@/lib/admin/data";
import { getExpertApplicationDataById, getMissingRequiredFields } from "@/lib/expert/data";
import { validateReviewMessage } from "@/lib/validation/expert";

export type AdminActionState = {
  error?: string;
  success?: boolean;
};

const GENERIC_ERROR = "We couldn't complete that action. Please try again.";
const STALE_STATE_ERROR =
  "This application's status changed since the page loaded. Refresh to see its current status.";

function revalidateExpertPages(expertProfileId: string) {
  revalidatePath("/admin/experts");
  revalidatePath(`/admin/experts/${expertProfileId}`);
  // Path-based, not user-scoped -- safe to call unconditionally, and
  // necessary so the applicant's own Overview page reflects the new
  // status on next load.
  revalidatePath("/expert/application");
}

/**
 * Request Changes: submitted -> changes_requested. Requires a non-empty
 * message (validated here AND by expert_review_message_required_check in
 * the database -- two independent layers, same rule). The `.eq(
 * "application_status", "submitted")` in the WHERE clause is the
 * optimistic-concurrency check spec section 39 requires: if another
 * admin already acted on this application between page load and this
 * click, zero rows match and the caller gets a clear "state changed"
 * message instead of a silent no-op or a confusing generic error.
 */
export async function requestChangesAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const expertProfileId = String(formData.get("expert_profile_id") ?? "");
  if (!expertProfileId) return { error: GENERIC_ERROR };

  const message = validateReviewMessage(String(formData.get("message") ?? ""));
  if (!message.valid) return { error: message.error };

  const { data, error } = await supabase
    .from("expert_profiles")
    .update({ application_status: "changes_requested", review_message: message.value })
    .eq("id", expertProfileId)
    .eq("application_status", "submitted")
    .select("id");

  if (error) return { error: GENERIC_ERROR };
  if (!data || data.length === 0) return { error: STALE_STATE_ERROR };

  revalidateExpertPages(expertProfileId);
  return { success: true };
}

/** Reject: submitted -> rejected. Terminal for V1. Requires a non-empty
 * reason, stored in the same review_message column as Request Changes
 * (spec: one current review message, no separate internal-notes system). */
export async function rejectApplicationAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const expertProfileId = String(formData.get("expert_profile_id") ?? "");
  if (!expertProfileId) return { error: GENERIC_ERROR };

  const message = validateReviewMessage(String(formData.get("message") ?? ""));
  if (!message.valid) return { error: message.error };

  const { data, error } = await supabase
    .from("expert_profiles")
    .update({ application_status: "rejected", review_message: message.value })
    .eq("id", expertProfileId)
    .eq("application_status", "submitted")
    .select("id");

  if (error) return { error: GENERIC_ERROR };
  if (!data || data.length === 0) return { error: STALE_STATE_ERROR };

  revalidateExpertPages(expertProfileId);
  return { success: true };
}

/**
 * Approve: submitted -> approved, profile_status -> ready (never
 * published -- approval and publication are separate actions, spec
 * section 24). Re-runs the exact same completeness check submission
 * itself uses (getMissingRequiredFields) against a fresh server-side read
 * of the application -- the admin UI's own checklist display is never
 * trusted as the actual gate, per spec section 25 ("do NOT trust the
 * Overview checklist alone").
 */
export async function approveApplicationAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const expertProfileId = String(formData.get("expert_profile_id") ?? "");
  if (!expertProfileId) return { error: GENERIC_ERROR };

  const applicationData = await getExpertApplicationDataById(supabase, expertProfileId);
  if (!applicationData) return { error: "Application not found." };

  const missingFields = getMissingRequiredFields(applicationData);
  if (missingFields.length > 0) {
    return {
      error: `Cannot approve: this application is still missing ${missingFields.join(", ")}.`,
    };
  }

  const { data, error } = await supabase
    .from("expert_profiles")
    .update({ application_status: "approved", profile_status: "ready" })
    .eq("id", expertProfileId)
    .eq("application_status", "submitted")
    .select("id");

  if (error) return { error: GENERIC_ERROR };
  if (!data || data.length === 0) return { error: STALE_STATE_ERROR };

  revalidateExpertPages(expertProfileId);
  return { success: true };
}

/**
 * Publish: approved+ready -> approved+published. Re-validates
 * publish-readiness server-side (approved, profile complete, >=1
 * category, >=1 enabled duration, >=1 format, a slug -- every
 * expert_profiles row already has a slug from creation) rather than
 * trusting that the admin detail page's display of this data is still
 * accurate.
 */
export async function publishExpertAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const expertProfileId = String(formData.get("expert_profile_id") ?? "");
  if (!expertProfileId) return { error: GENERIC_ERROR };

  const applicationData = await getExpertApplicationDataById(supabase, expertProfileId);
  if (!applicationData) return { error: "Application not found." };

  if (applicationData.expertProfile.application_status !== "approved") {
    return { error: STALE_STATE_ERROR };
  }

  const missingFields = getMissingRequiredFields(applicationData);
  if (missingFields.length > 0) {
    return {
      error: `Cannot publish: this profile is still missing ${missingFields.join(", ")}.`,
    };
  }
  if (applicationData.categoryIds.length === 0) {
    return { error: "Cannot publish: select at least one expertise category first." };
  }
  const activeOfferings = applicationData.sessionOfferings.filter((o) => o.is_active);
  if (activeOfferings.length === 0) {
    return { error: "Cannot publish: at least one active session duration is required." };
  }
  if (!applicationData.expertProfile.online_enabled && !applicationData.expertProfile.in_person_enabled) {
    return { error: "Cannot publish: at least one session format (online or in person) is required." };
  }
  if (!applicationData.expertProfile.slug) {
    return { error: "Cannot publish: this profile has no public URL slug." };
  }

  const { data, error } = await supabase
    .from("expert_profiles")
    .update({ profile_status: "published" })
    .eq("id", expertProfileId)
    .eq("application_status", "approved")
    .eq("profile_status", "ready")
    .select("id");

  if (error) return { error: GENERIC_ERROR };
  if (!data || data.length === 0) return { error: STALE_STATE_ERROR };

  revalidateExpertPages(expertProfileId);
  revalidatePath("/experts");
  revalidatePath(`/experts/${applicationData.expertProfile.slug}`);
  return { success: true };
}

/** Unpublish: published -> ready. Disappears from the public directory
 * and profile page immediately (both are backed by views filtered to
 * profile_status = 'published'). Application stays approved -- this is a
 * visibility toggle, not a re-review. */
export async function unpublishExpertAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const expertProfileId = String(formData.get("expert_profile_id") ?? "");
  if (!expertProfileId) return { error: GENERIC_ERROR };

  const { data: current } = await supabase
    .from("expert_profiles")
    .select("slug")
    .eq("id", expertProfileId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("expert_profiles")
    .update({ profile_status: "ready" })
    .eq("id", expertProfileId)
    .eq("application_status", "approved")
    .eq("profile_status", "published")
    .select("id");

  if (error) return { error: GENERIC_ERROR };
  if (!data || data.length === 0) return { error: STALE_STATE_ERROR };

  revalidateExpertPages(expertProfileId);
  revalidatePath("/experts");
  if (current?.slug) revalidatePath(`/experts/${current.slug}`);
  return { success: true };
}

/** Suspend: ready or published -> suspended. Minimal operational safety
 * control (spec section 27) -- disappears from public immediately if it
 * was published. Only reachable once an application has been approved. */
export async function suspendExpertAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const expertProfileId = String(formData.get("expert_profile_id") ?? "");
  if (!expertProfileId) return { error: GENERIC_ERROR };

  const { data: current } = await supabase
    .from("expert_profiles")
    .select("slug, profile_status")
    .eq("id", expertProfileId)
    .maybeSingle();

  if (!current || (current.profile_status !== "ready" && current.profile_status !== "published")) {
    return { error: STALE_STATE_ERROR };
  }

  const { data, error } = await supabase
    .from("expert_profiles")
    .update({ profile_status: "suspended" })
    .eq("id", expertProfileId)
    .eq("application_status", "approved")
    .eq("profile_status", current.profile_status)
    .select("id");

  if (error) return { error: GENERIC_ERROR };
  if (!data || data.length === 0) return { error: STALE_STATE_ERROR };

  revalidateExpertPages(expertProfileId);
  revalidatePath("/experts");
  if (current.slug) revalidatePath(`/experts/${current.slug}`);
  return { success: true };
}

/** Restore: suspended -> ready. The reverse of Suspend -- without this,
 * suspending a profile would be a one-way dead end, which is not
 * "minimal operational safety," it's a trap. Does not republish by
 * itself: a restored profile goes back to Ready, and Publish is a
 * separate, deliberate action, same as the original approve -> publish
 * split. */
export async function restoreExpertAction(
  _prevState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const supabase = await createClient();
  const auth = await requireAdminForAction(supabase);
  if (!auth.ok) return { error: auth.error };

  const expertProfileId = String(formData.get("expert_profile_id") ?? "");
  if (!expertProfileId) return { error: GENERIC_ERROR };

  const { data, error } = await supabase
    .from("expert_profiles")
    .update({ profile_status: "ready" })
    .eq("id", expertProfileId)
    .eq("application_status", "approved")
    .eq("profile_status", "suspended")
    .select("id");

  if (error) return { error: GENERIC_ERROR };
  if (!data || data.length === 0) return { error: STALE_STATE_ERROR };

  revalidateExpertPages(expertProfileId);
  return { success: true };
}
