import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getExpertPhotoUrl, getExpertPhotoUrls, type ExpertApplicationData } from "@/lib/expert/data";
import { EXPERT_EXPERIENCE_RANGE_LABELS, type ExpertExperienceRange } from "@/types/expert";
import { describeSupabaseError } from "@/lib/supabase/errors";

type TypedClient = SupabaseClient<Database>;

/**
 * Normalized shape the shared ExpertDetailView component renders --
 * deliberately NOT the raw expert_profile_public row (which still carries
 * profile_image_path, a raw storage path that encodes the owner's
 * user_id, see 016_public_expert_views.sql's comments). Every caller of
 * this module (public /experts/[slug], and the owner-only
 * /expert/application/preview) resolves the photo to a URL here, once,
 * server-side, before anything reaches a component.
 */
export type PublicProfileData = {
  slug: string;
  fullName: string;
  headline: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
  yearsExperienceLabel: string | null;
  shortBio: string | null;
  expertiseSummary: string | null;
  problemsHelpWith: string | null;
  whoIHelp: string | null;
  careerHighlights: string | null;
  linkedinUrl: string | null;
  country: string | null;
  city: string | null;
  photoUrl: string | null;
  categoryNames: string[];
  onlineEnabled: boolean;
  inPersonEnabled: boolean;
  sessionOfferings: { durationMinutes: number; price: number; currency: string }[];
};

export type PublicDirectoryCard = {
  slug: string;
  fullName: string;
  headline: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
  photoUrl: string | null;
  categoryNames: string[];
  startingPrice: number | null;
  onlineEnabled: boolean;
  inPersonEnabled: boolean;
};

/**
 * Real, published-only category taxonomy for the homepage "what are you
 * trying to solve?" discovery section -- the ACTUAL 8 expert_categories
 * rows, not an invented problem list. Fetched once, no join needed
 * (public.expert_categories has no RLS -- it's reference data, already
 * readable by anon elsewhere in this app).
 */
export type ExpertCategorySummary = { name: string; sortOrder: number };

export async function getExpertCategories(supabase: TypedClient): Promise<ExpertCategorySummary[]> {
  const { data, error } = await supabase.from("expert_categories").select("name, sort_order").order("sort_order");

  if (error) {
    console.error(`getExpertCategories: failed to load expert_categories: ${describeSupabaseError(error)}`);
    return [];
  }

  return (data ?? []).map((row) => ({ name: row.name, sortOrder: row.sort_order }));
}

/** /experts -- card list, backed by get_expert_directory_public()
 * (031_public_data_functions.sql; replaces the retired expert_directory_
 * public view -- same column list, same profile_status = 'published'
 * filter, same SECURITY DEFINER mechanism, now as a function rather than
 * a view so it isn't flagged by Supabase's Security Definer View
 * advisor). There is no additional status filter to apply here -- the
 * function itself already resolves to published rows only.
 *
 * Throws on failure rather than returning [], because it runs inside the
 * shared cache (lib/public/cached.ts) and an empty result must never be
 * cached for every visitor. Photo URLs are signed in ONE batched storage
 * call instead of one per expert. */
export async function fetchPublicExpertDirectory(supabase: TypedClient): Promise<PublicDirectoryCard[]> {
  // GET (the function is STABLE/read-only) so supabase-js retries it on a
  // dropped connection -- it only auto-retries GET/HEAD/OPTIONS requests.
  const { data, error } = await supabase.rpc("get_expert_directory_public", undefined, { get: true });
  if (error) throw new Error(`failed to load get_expert_directory_public: ${describeSupabaseError(error)}`);

  const rows = data ?? [];
  const photoUrls = await getExpertPhotoUrls(
    supabase,
    rows.map((row) => row.profile_image_path),
  );

  return rows.map((row, index) => ({
    slug: row.slug!,
    fullName: row.full_name ?? "",
    headline: row.headline ?? null,
    currentPosition: row.current_position,
    currentCompany: row.current_company,
    photoUrl: photoUrls[index],
    categoryNames: row.category_names ?? [],
    startingPrice: row.starting_price,
    onlineEnabled: row.online_enabled ?? false,
    inPersonEnabled: row.in_person_enabled ?? false,
  }));
}

/** /experts/[slug] -- full profile, backed by get_expert_profile_public()
 * + get_expert_session_types_public() (031_public_data_functions.sql;
 * replace the retired expert_profile_public/expert_session_types_public
 * views). Returns null for any non-published slug (including one that
 * doesn't exist at all, or belongs to a draft/submitted/rejected/
 * suspended application) -- the two cases are indistinguishable on
 * purpose, so a private application never leaks its existence.
 *
 * A database/network failure throws instead (it runs inside the shared
 * cache, and a failure must never be cached as "not found"). */
export async function fetchPublicExpertProfile(supabase: TypedClient, slug: string): Promise<PublicProfileData | null> {
  const [{ data: profile, error }, { data: sessionTypes, error: sessionError }] = await Promise.all([
    supabase.rpc("get_expert_profile_public", { p_slug: slug }, { get: true }).maybeSingle(),
    supabase.rpc("get_expert_session_types_public", { p_slug: slug }, { get: true }),
  ]);
  if (error) throw new Error(`failed to load get_expert_profile_public: ${describeSupabaseError(error)}`);
  if (!profile) return null;
  if (sessionError) {
    throw new Error(`failed to load get_expert_session_types_public: ${describeSupabaseError(sessionError)}`);
  }

  const [photoUrl] = await getExpertPhotoUrls(supabase, [profile.profile_image_path]);

  return {
    slug: profile.slug!,
    fullName: profile.full_name ?? "",
    headline: profile.headline,
    currentPosition: profile.current_position,
    currentCompany: profile.current_company,
    yearsExperienceLabel: profile.years_experience_range
      ? EXPERT_EXPERIENCE_RANGE_LABELS[profile.years_experience_range as ExpertExperienceRange]
      : null,
    shortBio: profile.short_bio,
    expertiseSummary: profile.expertise_summary,
    problemsHelpWith: profile.problems_help_with,
    whoIHelp: profile.who_i_help,
    careerHighlights: profile.career_highlights,
    linkedinUrl: profile.linkedin_url,
    country: profile.country,
    city: profile.city,
    photoUrl,
    categoryNames: profile.category_names ?? [],
    onlineEnabled: profile.online_enabled ?? false,
    inPersonEnabled: profile.in_person_enabled ?? false,
    sessionOfferings: (sessionTypes ?? []).map((s) => ({
      durationMinutes: s.duration_minutes!,
      price: Number(s.base_price),
      currency: s.currency ?? "ETB",
    })),
  };
}

/**
 * /expert/application/preview -- the SAME presentation shape as
 * fetchPublicExpertProfile, built from the applicant's own (not
 * necessarily published) data instead of the public views, so the owner
 * can see exactly what their public page will look like before it's
 * live. Never used to make an unpublished profile publicly discoverable
 * -- the caller (the preview page) is responsible for restricting who
 * reaches this, via the owner-only RLS on the underlying tables
 * (getExpertApplicationData already only returns the caller's own row).
 */
export async function toPreviewProfileData(
  supabase: TypedClient,
  data: ExpertApplicationData,
  fullName: string,
  categoryNames: string[],
): Promise<PublicProfileData> {
  const { expertProfile, sessionOfferings } = data;

  return {
    slug: expertProfile.slug,
    fullName,
    headline: expertProfile.headline,
    currentPosition: expertProfile.current_position,
    currentCompany: expertProfile.current_company,
    yearsExperienceLabel: expertProfile.years_experience_range
      ? EXPERT_EXPERIENCE_RANGE_LABELS[expertProfile.years_experience_range as ExpertExperienceRange]
      : null,
    shortBio: expertProfile.short_bio,
    expertiseSummary: expertProfile.expertise_summary,
    problemsHelpWith: expertProfile.problems_help_with,
    whoIHelp: expertProfile.who_i_help,
    careerHighlights: expertProfile.career_highlights,
    linkedinUrl: expertProfile.linkedin_url,
    country: expertProfile.country,
    city: expertProfile.city,
    photoUrl: await getExpertPhotoUrl(supabase, expertProfile.profile_image_path),
    categoryNames,
    onlineEnabled: expertProfile.online_enabled,
    inPersonEnabled: expertProfile.in_person_enabled,
    sessionOfferings: sessionOfferings
      .filter((o) => o.is_active)
      .sort((a, b) => a.duration_minutes - b.duration_minutes)
      .map((o) => ({
        durationMinutes: o.duration_minutes,
        price: Number(o.base_price),
        currency: o.currency,
      })),
  };
}
