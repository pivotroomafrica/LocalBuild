import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage, getApplicantIdentity } from "@/lib/admin/data";
import { getExpertApplicationDataById } from "@/lib/expert/data";
import { maskHiddenFields, toPreviewProfileData } from "@/lib/public/data";
import { ExpertDetailView } from "@/components/site/ExpertDetailView";
import { PreviewBar } from "@/components/site/PreviewBar";

export const metadata = { title: "Profile preview — Pivotroom", robots: { index: false } };

/** Admin preview: the expert's public profile with the admin's visibility
 * choices applied, before or after publishing. */
export default async function AdminExpertPreviewPage({ params }: PageProps<"/preview/expert/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  await requireAdminPage(supabase);

  const data = await getExpertApplicationDataById(supabase, id);
  if (!data) notFound();

  const [identity, { data: categories }] = await Promise.all([
    getApplicantIdentity(supabase, data.expertProfile.user_id),
    supabase.from("expert_categories").select("id, name").in("id", data.categoryIds.length > 0 ? data.categoryIds : [""]),
  ]);

  const profile = maskHiddenFields(
    await toPreviewProfileData(
      supabase,
      data,
      identity?.full_name ?? "",
      (categories ?? []).map((c) => c.name),
    ),
    data.expertProfile.hidden_fields,
  );

  return (
    <>
      <PreviewBar
        note="This is how clients will see this profile, with your visibility choices applied."
        backHref={`/admin/experts/${id}`}
        backLabel="Back to the expert"
      />
      <main className="flex-1" style={{ background: "#ffffff" }}>
        <ExpertDetailView profile={profile} />
      </main>
    </>
  );
}
