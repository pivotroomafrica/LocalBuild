import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExpertApplicationData } from "@/lib/expert/data";
import { maskHiddenFields, toPreviewProfileData } from "@/lib/public/data";
import { ExpertDetailView } from "@/components/site/ExpertDetailView";
import { PreviewBar } from "@/components/site/PreviewBar";

export const metadata = { title: "Your profile preview — Pivotroom", robots: { index: false } };

/** The expert's own preview, only of their own application (RLS), exactly
 * as clients will see it, including anything our team chose to hide. */
export default async function MyProfilePreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/preview/my-profile");

  const [data, { data: account }] = await Promise.all([
    getExpertApplicationData(supabase, user.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!data) redirect("/expert/application");

  const { data: categories } = await supabase
    .from("expert_categories")
    .select("id, name")
    .in("id", data.categoryIds.length > 0 ? data.categoryIds : [""]);

  const profile = maskHiddenFields(
    await toPreviewProfileData(
      supabase,
      data,
      account?.full_name ?? "",
      (categories ?? []).map((c) => c.name),
    ),
    data.expertProfile.hidden_fields,
  );

  return (
    <>
      <PreviewBar
        note="Only you can see this. It is how clients will see your profile once it is published."
        backHref="/expert/application"
        backLabel="Back to your application"
      />
      <main className="flex-1" style={{ background: "#ffffff" }}>
        <ExpertDetailView profile={profile} />
      </main>
    </>
  );
}
