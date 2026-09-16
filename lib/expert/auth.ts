import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type TypedClient = SupabaseClient<Database>;

/**
 * Server-side authorization for every page in the expert OPERATIONAL area
 * (availability, and as of Phase 7, the session dashboard/list/detail) --
 * distinct from /expert/application/*, which any logged-in user may visit
 * to apply. proxy.ts already requires a session for the whole /expert/*
 * prefix; this is the "and application_status = approved" half. RLS is the
 * layer that holds even if this check had a bug: every read below it is
 * additionally scoped to the same approved-owner condition at the
 * database level (e.g. bookings_select_own_expert, 039).
 *
 * Eligibility is derived from expert_profiles.application_status, NEVER
 * from profiles.role -- that column intentionally stays 'customer' even
 * for a published expert (spec section 34), so profiles.role can never be
 * the gate here.
 *
 * `currentPath` drives both possible redirects so a visitor lands back on
 * the exact page they asked for, whichever operational route that is
 * (availability, dashboard, sessions, ...), not a value hardcoded to one
 * specific caller:
 *   - Not logged in -> /auth/login?next=<currentPath>
 *   - No expert_profiles row at all (a normal customer who never applied)
 *     -> /become-an-expert?from=<currentPath>, which shows why they landed
 *     there and offers "Apply to Become an Expert."
 *   - A row exists but application_status isn't 'approved' (draft,
 *     submitted, changes_requested, or rejected) -> /expert/application,
 *     which already renders a clear, status-specific panel for every one
 *     of those states.
 *   - application_status = 'approved' (ready/published/suspended) ->
 *     allowed through, unchanged.
 */
export async function requireApprovedExpertPage(
  supabase: TypedClient,
  currentPath: string,
): Promise<{ expertProfileId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(currentPath)}`);

  const { data: expertProfile } = await supabase
    .from("expert_profiles")
    .select("id, application_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!expertProfile) {
    redirect(`/become-an-expert?from=${encodeURIComponent(currentPath)}`);
  }

  if (expertProfile.application_status !== "approved") {
    redirect("/expert/application");
  }

  return { expertProfileId: expertProfile.id };
}
