import type { Tables } from "@/types/database";

export type ExpertProfile = Tables<"expert_profiles">;
export type ExpertCategory = Tables<"expert_categories">;
export type ExpertProfileCategory = Tables<"expert_profile_categories">;
export type ExpertSessionType = Tables<"expert_session_types">;

export type ApplicationStatus = "draft" | "submitted" | "approved" | "rejected";
export type ExpertProfileStatus = "draft" | "ready" | "published" | "suspended";

export const EXPERT_EXPERIENCE_RANGES = [
  "lt_5",
  "5_9",
  "10_14",
  "15_19",
  "20_plus",
] as const;

export type ExpertExperienceRange = (typeof EXPERT_EXPERIENCE_RANGES)[number];

export const EXPERT_EXPERIENCE_RANGE_LABELS: Record<ExpertExperienceRange, string> = {
  lt_5: "Less than 5 years",
  "5_9": "5–9 years",
  "10_14": "10–14 years",
  "15_19": "15–19 years",
  "20_plus": "20+ years",
};

export const SESSION_DURATIONS = [15, 30, 45, 60, 90] as const;
export type SessionDuration = (typeof SESSION_DURATIONS)[number];

export const MAX_EXPERT_CATEGORIES = 3;

/** Fields an applicant may edit on the "Professional Identity" + "About
 * Your Experience" section (app/expert/application/profile). */
export type ExpertProfileInput = {
  headline: string;
  current_position: string;
  current_company: string;
  years_experience_range: ExpertExperienceRange | "";
  linkedin_url: string;
  country: string;
  city: string;
  short_bio: string;
  expertise_summary: string;
  problems_help_with: string;
  who_i_help: string;
  career_highlights: string;
};

/** app/expert/application/sessions -- one 60-minute base rate, which
 * durations are enabled, and which formats are supported. Prices for
 * every enabled duration are derived from base_hourly_price (see
 * lib/expert/pricing.ts), never entered individually. */
export type SessionPricingInput = {
  base_hourly_price: string;
  enabled_durations: SessionDuration[];
  online_enabled: boolean;
  in_person_enabled: boolean;
};
