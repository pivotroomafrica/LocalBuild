import { createClient } from "@/lib/supabase/server";
import { ensureExpertProfileDraft } from "@/lib/expert/actions";
import { getExpertPhotoUrl } from "@/lib/expert/data";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";
import { ExpertProfileForm } from "@/components/expert/ExpertProfileForm";
import { PhotoUpload } from "@/components/expert/PhotoUpload";

export default async function ExpertApplicationProfilePage() {
  const expertProfile = await ensureExpertProfileDraft();
  const supabase = await createClient();
  const photoUrl = await getExpertPhotoUrl(supabase, expertProfile.profile_image_path);

  return (
    <div>
      <ExpertApplicationNav current="/expert/application/profile" />
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            Professional Profile
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            This is used to review your application and, later, to build your public expert
            profile.
          </p>
        </div>

        <section>
          <h2 className="mb-3 text-base font-semibold text-[var(--color-text)]">Profile Photo</h2>
          <PhotoUpload currentPhotoUrl={photoUrl} />
        </section>

        <ExpertProfileForm expertProfile={expertProfile} />
      </div>
    </div>
  );
}
