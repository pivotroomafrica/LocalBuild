import { createClient } from "@/lib/supabase/server";
import { getPublicExpertDirectory, getExpertCategories } from "@/lib/public/data";
import { HomeHero } from "@/components/marketing/HomeHero";
import { ExperienceStatement } from "@/components/marketing/ExperienceStatement";
import { ProblemDiscovery } from "@/components/marketing/ProblemDiscovery";
import { FinalCta } from "@/components/marketing/FinalCta";
import { MeetOurExperts } from "@/components/experts/MeetOurExperts";

/**
 * Home -- editorial redesign (spec: "PIVOTROOM.AFRICA -- ELITE WEBSITE
 * DESIGN TRANSFORMATION"), homepage-only pass. Section order follows the
 * spec's own scroll narrative (section 23): there are experienced people
 * here (hero) -> a quiet philosophical beat (light ExperienceStatement,
 * section 9) -> here they are (MeetOurExperts) -> why this matters (dark
 * ExperienceStatement, the ONE ink moment, section 24) -> how to find the
 * right one (ProblemDiscovery) -> do this now (FinalCta). Booking/session/
 * matching-preview/profile-story sections from the spec live on OTHER
 * pages (not yet redesigned) and are intentionally out of scope for this
 * pass.
 *
 * Auth-aware for the same reason PublicHeader is: reading cookies() here
 * opts the route out of static prerendering, so a logged-in visitor's
 * hero CTA is always correct.
 *
 * ONE server-side fetch of the published expert directory
 * (getPublicExpertDirectory -- get_expert_directory_public(),
 * 031_public_data_functions.sql) is passed down to both HomeHero (for the
 * ExpertConstellation) and MeetOurExperts (for the marquee rows) -- no
 * second query, same published-only data used identically both places.
 * getExpertCategories() is the one additional query this pass adds (plain
 * reference-table read, no RLS, no migration) for ProblemDiscovery's real
 * taxonomy.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [experts, categories] = await Promise.all([
    getPublicExpertDirectory(supabase),
    getExpertCategories(supabase),
  ]);

  return (
    <div className="flex flex-col">
      <HomeHero isLoggedIn={Boolean(user)} experts={experts} />

      <ExperienceStatement
        tone="light"
        lines={["Experience shouldn't depend", "on who you happen to know."]}
      />

      <MeetOurExperts experts={experts} />

      <ExperienceStatement
        tone="dark"
        lines={["Africa doesn't have", "an experience problem.", "It has an access problem."]}
        sublabel="Pivotroom exists to close that gap, one conversation at a time."
      />

      <ProblemDiscovery categories={categories} />

      <FinalCta />
    </div>
  );
}
