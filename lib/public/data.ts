import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getExpertPhotoUrl, getExpertPhotoUrls, type ExpertApplicationData } from "@/lib/expert/data";
import { EXPERT_EXPERIENCE_RANGE_LABELS, type ExpertExperienceRange } from "@/types/expert";
import { describeSupabaseError } from "@/lib/supabase/errors";
import { customerPrice, fetchPlatformPricing } from "@/lib/pricing/platform";

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
  /** price is the VAT-inclusive amount the customer pays. */
  sessionOfferings: { durationMinutes: number; price: number; currency: string }[];
  languages: string[];
  responseTime: ExpertResponseTime | null;
  experience: ExperienceEntry[];
  stats: ExpertPublicStats;
  reviews: PublicReview[];
};

export type ExpertResponseTime = "few_hours" | "one_day" | "two_days";

export const RESPONSE_TIME_LABELS: Record<ExpertResponseTime, string> = {
  few_hours: "Replies within a few hours",
  one_day: "Replies within a day",
  two_days: "Replies within two days",
};

/** One line of the dated experience timeline (end_year null = "now"). */
export type ExperienceEntry = {
  startYear: number;
  endYear: number | null;
  title: string;
  organization: string;
};

/** Real activity: paid sessions whose time has passed, visible reviews,
 * and the "Top expert" badge rule from migration 049c. */
export type ExpertPublicStats = {
  sessionsCompleted: number;
  reviewCount: number;
  ratingAvg: number | null;
  isTopExpert: boolean;
};

export type PublicReview = {
  rating: number;
  body: string;
  reviewerName: string;
  durationMinutes: number;
  createdAt: string;
};

const EMPTY_STATS: ExpertPublicStats = { sessionsCompleted: 0, reviewCount: 0, ratingAvg: null, isTopExpert: false };

function toResponseTime(value: string | null | undefined): ExpertResponseTime | null {
  return value === "few_hours" || value === "one_day" || value === "two_days" ? value : null;
}

/** Defensive parse of expert_profiles.experience (jsonb): keeps only
 * well-formed entries, newest first. */
export function parseExperience(value: unknown): ExperienceEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ExperienceEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const startYear = Number(row.start_year);
    const endYear = row.end_year == null ? null : Number(row.end_year);
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const organization = typeof row.organization === "string" ? row.organization.trim() : "";
    if (!Number.isInteger(startYear) || (endYear !== null && !Number.isInteger(endYear)) || !title) continue;
    entries.push({ startYear, endYear, title, organization });
  }
  return entries.sort((a, b) => (b.endYear ?? 9999) - (a.endYear ?? 9999) || b.startYear - a.startYear);
}

export type PublicDirectoryCard = {
  slug: string;
  fullName: string;
  headline: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
  photoUrl: string | null;
  categoryNames: string[];
  startingPrice: number | null;
  /** Length of the session the starting price is for. */
  startingDurationMinutes: number | null;
  onlineEnabled: boolean;
  inPersonEnabled: boolean;
  languages: string[];
  stats: ExpertPublicStats;
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

  // Throws (never returns []) because it runs inside the shared cache.
  if (error) throw new Error(`failed to load expert_categories: ${describeSupabaseError(error)}`);

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
  const [{ data, error }, pricing] = await Promise.all([
    supabase.rpc("get_expert_directory_public_v2", undefined, { get: true }),
    fetchPlatformPricing(supabase),
  ]);
  if (error) throw new Error(`failed to load get_expert_directory_public_v2: ${describeSupabaseError(error)}`);

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
    // Shown VAT-inclusive: the customer-facing price (V2 pricing rules).
    startingPrice: row.starting_price == null ? null : customerPrice(Number(row.starting_price), pricing.vatRate),
    startingDurationMinutes: row.starting_duration_minutes ?? null,
    onlineEnabled: row.online_enabled ?? false,
    inPersonEnabled: row.in_person_enabled ?? false,
    languages: row.languages ?? [],
    stats: {
      sessionsCompleted: row.sessions_completed ?? 0,
      reviewCount: row.review_count ?? 0,
      ratingAvg: row.rating_avg == null ? null : Number(row.rating_avg),
      isTopExpert: row.is_top_expert ?? false,
    },
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
  const [
    { data: profile, error },
    { data: sessionTypes, error: sessionError },
    { data: reviews, error: reviewsError },
    pricing,
  ] = await Promise.all([
    supabase.rpc("get_expert_profile_public_v2", { p_slug: slug }, { get: true }).maybeSingle(),
    supabase.rpc("get_expert_session_types_public", { p_slug: slug }, { get: true }),
    supabase.rpc("get_expert_reviews_public", { p_slug: slug }, { get: true }),
    fetchPlatformPricing(supabase),
  ]);
  if (error) throw new Error(`failed to load get_expert_profile_public_v2: ${describeSupabaseError(error)}`);
  if (!profile) return null;
  if (sessionError) {
    throw new Error(`failed to load get_expert_session_types_public: ${describeSupabaseError(sessionError)}`);
  }
  if (reviewsError) {
    throw new Error(`failed to load get_expert_reviews_public: ${describeSupabaseError(reviewsError)}`);
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
      price: customerPrice(Number(s.base_price), pricing.vatRate),
      currency: s.currency ?? "ETB",
    })),
    languages: profile.languages ?? [],
    responseTime: toResponseTime(profile.response_time),
    experience: parseExperience(profile.experience),
    stats: {
      sessionsCompleted: profile.sessions_completed ?? 0,
      reviewCount: profile.review_count ?? 0,
      ratingAvg: profile.rating_avg == null ? null : Number(profile.rating_avg),
      isTopExpert: profile.is_top_expert ?? false,
    },
    reviews: (reviews ?? []).map((review) => ({
      rating: review.rating,
      body: review.body,
      reviewerName: review.reviewer_name,
      durationMinutes: review.duration_minutes,
      createdAt: review.created_at,
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
  const pricing = await fetchPlatformPricing(supabase);

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
        price: customerPrice(Number(o.base_price), pricing.vatRate),
        currency: o.currency,
      })),
    languages: expertProfile.languages ?? [],
    responseTime: toResponseTime(expertProfile.response_time),
    experience: parseExperience(expertProfile.experience),
    // A preview has no public activity yet.
    stats: EMPTY_STATS,
    reviews: [],
  };
}

/**
 * Applies an admin's hidden_fields (050) to profile data built outside the
 * public read functions (the expert's and admin's previews), the same way
 * get_expert_profile_public_v2 masks them for visitors.
 */
export function maskHiddenFields(profile: PublicProfileData, hiddenFields: string[]): PublicProfileData {
  const hidden = new Set(hiddenFields);
  const hideStats = hidden.has("stats");
  const hideReviews = hideStats || hidden.has("reviews");
  return {
    ...profile,
    photoUrl: hidden.has("photo") ? null : profile.photoUrl,
    currentPosition: hidden.has("current_position") ? null : profile.currentPosition,
    currentCompany: hidden.has("current_company") ? null : profile.currentCompany,
    yearsExperienceLabel: hidden.has("years_experience") ? null : profile.yearsExperienceLabel,
    country: hidden.has("location") ? null : profile.country,
    city: hidden.has("location") ? null : profile.city,
    linkedinUrl: hidden.has("linkedin") ? null : profile.linkedinUrl,
    languages: hidden.has("languages") ? [] : profile.languages,
    responseTime: hidden.has("response_time") ? null : profile.responseTime,
    shortBio: hidden.has("short_bio") ? null : profile.shortBio,
    expertiseSummary: hidden.has("expertise_summary") ? null : profile.expertiseSummary,
    problemsHelpWith: hidden.has("problems_help_with") ? null : profile.problemsHelpWith,
    whoIHelp: hidden.has("who_i_help") ? null : profile.whoIHelp,
    careerHighlights: hidden.has("career_highlights") ? null : profile.careerHighlights,
    experience: hidden.has("experience") ? [] : profile.experience,
    stats: hideStats
      ? EMPTY_STATS
      : hideReviews
        ? { ...profile.stats, reviewCount: 0, ratingAvg: null }
        : profile.stats,
    reviews: hideReviews ? [] : profile.reviews,
  };
}
