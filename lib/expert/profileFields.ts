import type { TablesUpdate } from "@/types/database";
import {
  validateCareerHighlights,
  validateCurrentCompany,
  validateCurrentPosition,
  validateExpertCity,
  validateExpertCountry,
  validateExpertExperienceRange,
  validateExpertLinkedinUrl,
  validateExpertiseSummary,
  validateHeadline,
  validateProblemsHelpWith,
  validateShortBio,
  validateWhoIHelp,
} from "@/lib/validation/expert";
import { validateExperience, validateLanguages, validateResponseTime } from "@/lib/expert/profileDetails";

type ProfileUpdate = TablesUpdate<"expert_profiles">;
type Parsed = { ok: true; update: ProfileUpdate } | { ok: false; error: string };

const str = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/**
 * Onboarding step 1, "Who you are": role, one-line summary, years,
 * location, languages, LinkedIn. Shared by the expert's own form and the
 * admin editor so both apply exactly the same rules.
 */
export function parseIdentityFields(formData: FormData): Parsed {
  const checks = [
    ["current_position", validateCurrentPosition(str(formData, "current_position"))],
    ["current_company", validateCurrentCompany(str(formData, "current_company"))],
    ["headline", validateHeadline(str(formData, "headline"))],
    ["years_experience_range", validateExpertExperienceRange(str(formData, "years_experience_range"))],
    ["city", validateExpertCity(str(formData, "city"))],
    ["country", validateExpertCountry(str(formData, "country"))],
    ["linkedin_url", validateExpertLinkedinUrl(str(formData, "linkedin_url"))],
  ] as const;
  const update: Record<string, unknown> = {};
  for (const [field, result] of checks) {
    if (!result.valid) return { ok: false, error: result.error };
    update[field] = result.value;
  }

  // Languages arrive as ticked boxes plus an optional "other" text box.
  const languages = validateLanguages([...formData.getAll("languages").map(String), str(formData, "languages_other")].join(","));
  if (!languages.valid) return { ok: false, error: languages.error };
  update.languages = languages.value;

  return { ok: true, update: update as ProfileUpdate };
}

/**
 * Onboarding step 2, "What you've solved": the texts matching reads, plus
 * the optional highlights and experience timeline.
 */
export function parseExpertiseFields(formData: FormData): Parsed {
  const checks = [
    ["problems_help_with", validateProblemsHelpWith(str(formData, "problems_help_with"))],
    ["who_i_help", validateWhoIHelp(str(formData, "who_i_help"))],
    ["short_bio", validateShortBio(str(formData, "short_bio"))],
    ["expertise_summary", validateExpertiseSummary(str(formData, "expertise_summary"))],
    ["career_highlights", validateCareerHighlights(str(formData, "career_highlights"))],
  ] as const;
  const update: Record<string, unknown> = {};
  for (const [field, result] of checks) {
    if (!result.valid) return { ok: false, error: result.error };
    update[field] = result.value;
  }

  const experience = validateExperience(str(formData, "experience") || "[]");
  if (!experience.valid) return { ok: false, error: experience.error };
  update.experience = experience.value;

  return { ok: true, update: update as ProfileUpdate };
}

/** Step 3's reply-time answer (the pricing fields have their own action). */
export function parseResponseTime(formData: FormData): Parsed {
  const responseTime = validateResponseTime(str(formData, "response_time"));
  if (!responseTime.valid) return { ok: false, error: responseTime.error };
  return { ok: true, update: { response_time: responseTime.value } };
}

/** Languages offered as tick boxes; anything else goes in "Other". */
export const COMMON_LANGUAGES = ["Amharic", "English", "Afaan Oromoo", "Tigrinya", "Somali", "Arabic"];

/** Details an admin can hide from the public profile (050). */
export const HIDEABLE_FIELDS = [
  { key: "photo", label: "Photo" },
  { key: "current_position", label: "Current role" },
  { key: "current_company", label: "Company" },
  { key: "years_experience", label: "Years of experience" },
  { key: "location", label: "City and country" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "languages", label: "Languages" },
  { key: "response_time", label: "Reply time" },
  { key: "short_bio", label: "About (bio)" },
  { key: "problems_help_with", label: "Problems they help with" },
  { key: "who_i_help", label: "Who they help" },
  { key: "expertise_summary", label: "Expertise" },
  { key: "career_highlights", label: "Career highlights" },
  { key: "experience", label: "Experience timeline" },
  { key: "reviews", label: "Client reviews and rating" },
  { key: "stats", label: "Sessions completed and Top expert badge" },
] as const;

export type HideableField = (typeof HIDEABLE_FIELDS)[number]["key"];
