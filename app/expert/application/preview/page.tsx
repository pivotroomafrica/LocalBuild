import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getExpertApplicationData } from "@/lib/expert/data";
import { toPreviewProfileData } from "@/lib/public/data";
import { PublicProfileView } from "@/components/expert/PublicProfileView";
import { ExpertApplicationNav } from "@/components/layout/ExpertApplicationNav";

/**
 * Owner-only preview of the eventual public profile, reusing
 * PublicProfileView (spec section 56) so there is exactly one expert
 * profile presentation design, not two that can drift apart. This route
 * is never linked from anywhere public and does not touch
 * profile_status or any admin table -- viewing it has no effect on
 * publication. Access control is the same as every other /expert/* page:
 * proxy.ts requires a session, and getExpertApplicationData only ever
 * returns the CALLER's own row (RLS), so there is no way to preview
 * someone else's application via this route.
 */
export default async function ExpertApplicationPreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [data, { data: profileRow }] = await Promise.all([
    getExpertApplicationData(supabase, user!.id),
    supabase.from("profiles").select("full_name").eq("id", user!.id).single(),
  ]);

  if (!data) {
    return <p className="text-sm text-[var(--color-danger)]">We couldn&apos;t load your application. Please try again.</p>;
  }

  const { data: categories } = await supabase
    .from("expert_categories")
    .select("id, name")
    .in("id", data.categoryIds.length > 0 ? data.categoryIds : [""]);

  const profile = await toPreviewProfileData(
    supabase,
    data,
    profileRow?.full_name ?? "",
    (categories ?? []).map((c) => c.name),
  );

  return (
    <div>
      <ExpertApplicationNav current="/expert/application/preview" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">Preview</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            This is only visible to you. It is not published or discoverable by anyone else.
          </p>
        </div>
        <Link href="/expert/application" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          &larr; Back
        </Link>
      </div>
      <PublicProfileView profile={profile} />
    </div>
  );
}
