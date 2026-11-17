import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getActiveExpertCategories, getExpertApplicationData, getExpertPhotoUrl } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { APPLICATION_FORM_ID, ExpertiseStepForm } from "@/components/expert/OnboardingStepForms";
import { LiveProfilePreview } from "@/components/expert/LiveProfilePreview";
import { previewValuesFrom } from "@/components/expert/previewValues";

export default async function ExpertApplicationExpertisePage({
  searchParams,
}: PageProps<"/expert/application/expertise">) {
  const expertProfile = await ensureExpertProfileDraft();

  const supabase = await createClient();
  const [categories, data, { saved }, photoUrl, { data: account }] = await Promise.all([
    getActiveExpertCategories(supabase),
    getExpertApplicationData(supabase, expertProfile.user_id, expertProfile),
    searchParams,
    getExpertPhotoUrl(supabase, expertProfile.profile_image_path),
    supabase.from("profiles").select("full_name").eq("id", expertProfile.user_id).maybeSingle(),
  ]);
  const profile = data?.expertProfile ?? expertProfile;

  return (
    <div>
      <ExpertApplicationNav current="/expert/application/expertise" />
      <div className="app-split">
        <div className="stack" style={{ gap: 24 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h1 className="ws-h1">What you&apos;ve solved</h1>
            <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
              Step 2 of 3, about 5 minutes. Write the way a client would describe their problem: this is how clients
              recognise that you can help.
            </p>
          </div>
          <ExpertiseStepForm
            profile={profile}
            categories={categories}
            selectedCategoryIds={data?.categoryIds ?? []}
            saved={saved === "1"}
          />
        </div>
        <LiveProfilePreview
          formId={APPLICATION_FORM_ID}
          saved={previewValuesFrom(profile, account?.full_name ?? "", data?.categoryIds ?? [])}
          photoUrl={photoUrl}
          categories={categories}
        />
      </div>
    </div>
  );
}
