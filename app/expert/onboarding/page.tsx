import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getActiveExpertCategories, getExpertApplicationData, getExpertPhotoUrl } from "@/lib/expert/data";
import { fetchPlatformPricing } from "@/lib/pricing/platform";
import { answersFrom } from "@/lib/expert/onboarding/answers";
import { planFromRules } from "@/lib/availability/plan";
import { OnboardingFlow } from "@/components/expert/onboarding/OnboardingFlow";

export const metadata = { title: "Build your expert profile" };

/**
 * Guided, card-by-card expert onboarding: mostly tap-to-answer chips that
 * the AI suggests from earlier answers, then an AI-written profile the
 * expert approves. Writes the same expert_profiles fields as the classic
 * form at /expert/application/*, which stays available for detailed edits
 * and for applications already sent for review.
 */
export default async function ExpertOnboardingPage() {
  const expertProfile = await ensureExpertProfileDraft();
  if (expertProfile.application_status !== "draft") redirect("/expert/application");

  const supabase = await createClient();
  const [categories, data, photoUrl, pricing, { data: ngos }, { data: account }] = await Promise.all([
    getActiveExpertCategories(supabase),
    getExpertApplicationData(supabase, expertProfile.user_id, expertProfile),
    getExpertPhotoUrl(supabase, expertProfile.profile_image_path),
    fetchPlatformPricing(supabase),
    supabase.from("ngos").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("full_name, country, city").eq("id", expertProfile.user_id).maybeSingle(),
  ]);

  const initial = answersFrom(
    expertProfile.onboarding_answers,
    expertProfile,
    data?.categoryIds ?? [],
    (data?.sessionOfferings ?? []).map((row) => row.duration_minutes),
  );
  // A plan saved earlier (here or on the Availability page) wins over the
  // working copy, so both screens always show the same thing.
  const [{ data: weekly }, { data: monthly }] = await Promise.all([
    supabase.from("expert_weekly_availability_rules").select("day_of_week, start_time, end_time"),
    supabase.from("expert_monthly_availability_rules").select("day_of_month, start_time, end_time"),
  ]);
  if ((weekly ?? []).length > 0 || (monthly ?? []).length > 0) {
    initial.plan = planFromRules(expertProfile.monthly_hours, weekly ?? [], monthly ?? []);
  }
  // Where they live was asked at signup (054); don't ask twice.
  initial.country ||= account?.country ?? "";
  initial.city ||= account?.city ?? "";

  return (
    <OnboardingFlow
      initial={initial}
      fullName={account?.full_name ?? ""}
      initialPhotoUrl={photoUrl}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      ngos={ngos ?? []}
      pricing={pricing}
      termsAccepted={expertProfile.terms_accepted_at != null}
      aiEnabled={Boolean(process.env.OPENAI_API_KEY?.trim())}
    />
  );
}
