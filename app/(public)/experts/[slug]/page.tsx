import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicExpertProfile } from "@/lib/public/data";
import { PublicProfileView } from "@/components/expert/PublicProfileView";
import { Container } from "@/components/ui/Container";

export default async function PublicExpertProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // getPublicExpertProfile reads exclusively through
  // get_expert_profile_public() (filtered to profile_status = 'published'
  // at the database level) -- any other status resolves to null here,
  // identical to a slug that was never registered at all. notFound()
  // renders a bare 404 either way, so a draft/submitted/rejected/
  // unpublished application never reveals that it exists.
  const profile = await getPublicExpertProfile(supabase, slug);
  if (!profile) notFound();

  return (
    <Container className="py-10 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <PublicProfileView profile={profile} />
      </div>
    </Container>
  );
}
