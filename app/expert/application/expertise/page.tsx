import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getActiveExpertCategories, getExpertApplicationData } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { ExpertiseStepForm } from "@/components/expert/OnboardingStepForms";

export default async function ExpertApplicationExpertisePage({
  searchParams,
}: PageProps<"/expert/application/expertise">) {
  const expertProfile = await ensureExpertProfileDraft();

  const supabase = await createClient();
  const [categories, data, { saved }] = await Promise.all([
    getActiveExpertCategories(supabase),
    getExpertApplicationData(supabase, expertProfile.user_id),
    searchParams,
  ]);

  return (
    <div>
      <ExpertApplicationNav current="/expert/application/expertise" />
      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="ws-h1">What you&apos;ve solved</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
            Step 2 of 3, about 5 minutes. Write the way a client would describe their problem: this is how clients
            recognise that you can help.
          </p>
        </div>
        <ExpertiseStepForm
          profile={data?.expertProfile ?? expertProfile}
          categories={categories}
          selectedCategoryIds={data?.categoryIds ?? []}
          saved={saved === "1"}
        />
      </div>
    </div>
  );
}
