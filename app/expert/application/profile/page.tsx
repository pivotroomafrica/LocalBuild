import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getExpertPhotoUrl } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { IdentityStepForm } from "@/components/expert/OnboardingStepForms";
import { PhotoUpload } from "@/components/expert/PhotoUpload";

export default async function ExpertApplicationProfilePage({ searchParams }: PageProps<"/expert/application/profile">) {
  const expertProfile = await ensureExpertProfileDraft();
  const supabase = await createClient();
  const [photoUrl, { saved }, { data: account }] = await Promise.all([
    getExpertPhotoUrl(supabase, expertProfile.profile_image_path),
    searchParams,
    supabase.from("profiles").select("full_name").eq("id", expertProfile.user_id).maybeSingle(),
  ]);

  return (
    <div>
      <ExpertApplicationNav current="/expert/application/profile" />
      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="ws-h1">Who you are</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
            Step 1 of 3, about 3 minutes. Clients see this at the top of your profile. Nothing is public until our team
            has reviewed and approved it.
          </p>
        </div>

        <div className="oq">
          <div className="oq-head">
            <span className="oq-n num" aria-hidden="true">
              01
            </span>
            <span className="oq-label">
              Add a clear photo of your face<span className="oq-req"> · required</span>
            </span>
          </div>
          <p className="oq-hint">Profiles with a real photo get booked far more often.</p>
          <PhotoUpload currentPhotoUrl={photoUrl} />
        </div>

        <IdentityStepForm profile={expertProfile} fullName={account?.full_name ?? ""} saved={saved === "1"} />
      </div>
    </div>
  );
}
