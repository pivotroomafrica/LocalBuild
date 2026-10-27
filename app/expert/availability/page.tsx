import { createClient } from "@/lib/supabase/server";
import { requireApprovedExpertPage } from "@/lib/expert/auth";
import {
  getExpertAvailabilitySettings,
  getExpertMonthlyAvailabilityRules,
  getExpertAvailabilityOverrides,
  getExpertOneOffAvailability,
} from "@/lib/availability/data";
import { AvailabilityManager } from "@/components/expert/AvailabilityManager";
import { RouterRefreshOnMount } from "@/components/layout/RouterRefreshOnMount";

/** Explicit documentation of intent (already implied by requireApprovedExpertPage's
 * cookies() read): this page must never be served from a static/prerendered
 * shell. Does not by itself fix stale back-navigation -- see
 * RouterRefreshOnMount's own comment for why that needs a client-side fix. */
export const dynamic = "force-dynamic";

export default async function ExpertAvailabilityPage() {
  const supabase = await createClient();
  const { expertProfileId } = await requireApprovedExpertPage(supabase, "/expert/availability");

  const [settings, rules, overrides, oneOffs] = await Promise.all([
    getExpertAvailabilitySettings(supabase),
    getExpertMonthlyAvailabilityRules(supabase),
    getExpertAvailabilityOverrides(supabase),
    getExpertOneOffAvailability(supabase),
  ]);

  return (
    <div>
      <RouterRefreshOnMount />

      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="ws-h1">Your available hours</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
            Clients can only book the times you add here. Add specific dates, a time that repeats every month, or both.
          </p>
        </div>

        <AvailabilityManager
          expertProfileId={expertProfileId}
          initialTimezone={settings?.timezone ?? null}
          initialRules={rules}
          initialOverrides={overrides}
          initialOneOffs={oneOffs}
        />
      </div>
    </div>
  );
}
