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
import { MonthlyPlanSection } from "@/components/expert/MonthlyPlanSection";
import { planFromRules } from "@/lib/availability/plan";
import { bookedMinutesThisMonth } from "@/lib/availability/booked";

/** Explicit documentation of intent (already implied by requireApprovedExpertPage's
 * cookies() read): this page must never be served from a static/prerendered
 * shell. Does not by itself fix stale back-navigation -- see
 * RouterRefreshOnMount's own comment for why that needs a client-side fix. */
export const dynamic = "force-dynamic";

export default async function ExpertAvailabilityPage() {
  const supabase = await createClient();
  const { expertProfileId } = await requireApprovedExpertPage(supabase, "/expert/availability");

  const [settings, rules, overrides, oneOffs, { data: weekly }, { data: profile }] = await Promise.all([
    getExpertAvailabilitySettings(supabase),
    getExpertMonthlyAvailabilityRules(supabase),
    getExpertAvailabilityOverrides(supabase),
    getExpertOneOffAvailability(supabase),
    supabase.from("expert_weekly_availability_rules").select("day_of_week, start_time, end_time"),
    supabase.from("expert_profiles").select("monthly_hours").eq("id", expertProfileId).maybeSingle(),
  ]);

  const bookedMinutes = await bookedMinutesThisMonth(
    supabase,
    expertProfileId,
    settings?.timezone ?? "Africa/Addis_Ababa",
  );

  return (
    <div>
      <RouterRefreshOnMount />

      <div className="stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="ws-h1">Your available hours</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
            Clients can only book the times you open here. Set your regular days once; add extra dates whenever you like.
          </p>
        </div>

        <MonthlyPlanSection
          initialPlan={planFromRules(profile?.monthly_hours ?? null, weekly ?? [], rules)}
          bookedMinutesThisMonth={bookedMinutes}
        />

        <AvailabilityManager
          key={rules.map((r) => r.id).join(",")}
          withPlan
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
