import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ExpertCategory, ExpertProfile, ExpertSessionType } from "@/types/expert";

type TypedClient = SupabaseClient<Database>;

export type ExpertApplicationData = {
  expertProfile: ExpertProfile;
  categoryIds: string[];
  sessionOfferings: ExpertSessionType[];
};

/**
 * Loads everything needed to render the applicant area for the current
 * user's own expert profile. Returns null if no draft exists yet -- the
 * caller (a page under app/expert/) is responsible for creating one via
 * ensureExpertProfileDraft before rendering a form.
 */
export async function getExpertApplicationData(
  supabase: TypedClient,
  userId: string,
): Promise<ExpertApplicationData | null> {
  const { data: expertProfile, error: expertProfileError } = await supabase
    .from("expert_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (expertProfileError) {
    console.error("getExpertApplicationData: failed to load expert_profiles", expertProfileError);
  }

  if (!expertProfile) return null;

  const [{ data: categoryLinks }, { data: sessionOfferings }] = await Promise.all([
    supabase
      .from("expert_profile_categories")
      .select("category_id")
      .eq("expert_profile_id", expertProfile.id),
    supabase
      .from("expert_session_types")
      .select("*")
      .eq("expert_profile_id", expertProfile.id)
      .order("duration_minutes"),
  ]);

  return {
    expertProfile,
    categoryIds: (categoryLinks ?? []).map((row) => row.category_id),
    sessionOfferings: sessionOfferings ?? [],
  };
}

/** The bucket is private (experts aren't public in Phase 2), so the photo
 * is only ever reachable via a short-lived signed URL, generated fresh on
 * each server render -- never a public/permanent URL. */
export async function getExpertPhotoUrl(
  supabase: TypedClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("expert-profile-images")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function getActiveExpertCategories(
  supabase: TypedClient,
): Promise<ExpertCategory[]> {
  const { data } = await supabase
    .from("expert_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  return data ?? [];
}

export type ApplicationSection = "profile" | "expertise" | "sessions";

export type ChecklistItem = { label: string; complete: boolean; section: ApplicationSection };

/**
 * Single source of truth for application completeness. Required for
 * submission per spec section 42. Photo + LinkedIn policy: photo
 * required, LinkedIn strongly encouraged but not gating.
 *
 * Every item is tagged with the /expert/application/* section it belongs
 * to, so the per-field checklist, the per-section summary
 * (getSectionCompletion), and the submission gate
 * (getMissingRequiredFields) can never disagree with each other -- they
 * all derive from this one array.
 */
export function getCompletionChecklist(data: ExpertApplicationData): ChecklistItem[] {
  const { expertProfile, categoryIds, sessionOfferings } = data;

  return [
    { label: "Professional headline", complete: Boolean(expertProfile.headline), section: "profile" },
    { label: "Current position", complete: Boolean(expertProfile.current_position), section: "profile" },
    {
      label: "Years of experience",
      complete: Boolean(expertProfile.years_experience_range),
      section: "profile",
    },
    { label: "Short bio", complete: Boolean(expertProfile.short_bio), section: "profile" },
    {
      label: "Expertise summary",
      complete: Boolean(expertProfile.expertise_summary),
      section: "profile",
    },
    {
      label: "Problems you help with",
      complete: Boolean(expertProfile.problems_help_with),
      section: "profile",
    },
    { label: "Who you help", complete: Boolean(expertProfile.who_i_help), section: "profile" },
    { label: "Country", complete: Boolean(expertProfile.country), section: "profile" },
    { label: "City", complete: Boolean(expertProfile.city), section: "profile" },
    { label: "Profile photo", complete: Boolean(expertProfile.profile_image_path), section: "profile" },
    {
      label: "At least 1 expertise category",
      complete: categoryIds.length > 0,
      section: "expertise",
    },
    {
      label: "At least 1 session offering",
      complete: sessionOfferings.length > 0,
      section: "sessions",
    },
  ];
}

export function getMissingRequiredFields(data: ExpertApplicationData): string[] {
  return getCompletionChecklist(data)
    .filter((item) => !item.complete)
    .map((item) => item.label);
}

/** Per-section completeness, built from the exact same checklist items as
 * getMissingRequiredFields -- never a second, independently-defined
 * notion of "complete." Drives both the Overview checklist display and
 * the Overview primary CTA. */
export function getSectionCompletion(
  data: ExpertApplicationData,
): Record<ApplicationSection, boolean> {
  const checklist = getCompletionChecklist(data);
  const isSectionComplete = (section: ApplicationSection) =>
    checklist.filter((item) => item.section === section).every((item) => item.complete);

  return {
    profile: isSectionComplete("profile"),
    expertise: isSectionComplete("expertise"),
    sessions: isSectionComplete("sessions"),
  };
}
