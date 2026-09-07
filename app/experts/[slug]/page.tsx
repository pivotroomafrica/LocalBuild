import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicExpertProfile } from "@/lib/public/data";
import { PublicProfileView } from "@/components/expert/PublicProfileView";

export default async function PublicExpertProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // getPublicExpertProfile reads exclusively through expert_profile_public
  // (filtered to profile_status = 'published' at the database level) --
  // any other status resolves to null here, identical to a slug that was
  // never registered at all. notFound() renders a bare 404 either way, so
  // a draft/submitted/rejected/unpublished application never reveals that
  // it exists (spec section 55).
  const profile = await getPublicExpertProfile(supabase, slug);
  if (!profile) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <PublicProfileView profile={profile} />
    </div>
  );
}
