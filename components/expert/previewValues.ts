import type { ExpertProfile } from "@/types/expert";
import type { PreviewValues } from "@/components/expert/LiveProfilePreview";

/** Starting values for LiveProfilePreview from the saved application. */
export function previewValuesFrom(profile: ExpertProfile, fullName: string, categoryIds: string[]): PreviewValues {
  return {
    fullName,
    currentPosition: profile.current_position ?? "",
    currentCompany: profile.current_company ?? "",
    headline: profile.headline ?? "",
    yearsRange: profile.years_experience_range ?? "",
    city: profile.city ?? "",
    country: profile.country ?? "",
    languages: profile.languages ?? [],
    shortBio: profile.short_bio ?? "",
    whoIHelp: profile.who_i_help ?? "",
    problemsHelpWith: profile.problems_help_with ?? "",
    expertiseSummary: profile.expertise_summary ?? "",
    careerHighlights: profile.career_highlights ?? "",
    categoryIds,
  };
}
