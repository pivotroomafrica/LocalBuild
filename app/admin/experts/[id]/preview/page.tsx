import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExpertApplicationDataById } from "@/lib/expert/data";
import { getApplicantIdentity } from "@/lib/admin/data";
import { maskHiddenFields, toPreviewProfileData } from "@/lib/public/data";
import { ExpertDetailView } from "@/components/site/ExpertDetailView";

/** The expert's public profile as clients will see it once published,
 * with the admin's visibility choices applied. */
export default async function AdminExpertPreviewPage({ params }: PageProps<"/admin/experts/[id]/preview">) {
  const { id } = await params;
  const supabase = await createClient();

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
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <p className="muted" style={{ margin: 0 }}>
          Preview with your visibility choices applied. Reviews and session counts appear once the profile is live.
        </p>
        <Link href={`/admin/experts/${id}`}>&larr; Back to the expert</Link>
      </div>
      <div className="pr relative left-1/2 w-screen max-w-[1440px] -translate-x-1/2">
        <ExpertDetailView profile={profile} />
      </div>
    </div>
  );
}
