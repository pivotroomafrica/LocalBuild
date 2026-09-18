import { createClient } from "@/lib/supabase/server";
import { requireApprovedExpertPage } from "@/lib/expert/auth";
import {
  getExpertAvailabilitySettings,
  getExpertMonthlyAvailabilityRules,
  getExpertAvailabilityOverrides,
  getExpertOneOffAvailability,
} from "@/lib/availability/data";
import { AvailabilityManager } from "@/components/expert/AvailabilityManager";
import { ExpertOperationsNav } from "@/components/layout/ExpertOperationsNav";
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
      <ExpertOperationsNav current="/expert/availability" />

      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Availability</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Make 1–5 hours available each month. You control exactly when those hours are offered.
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
