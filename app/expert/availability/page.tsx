import { createClient } from "@/lib/supabase/server";
import {
  requireApprovedExpertPage,
  getExpertAvailabilitySettings,
  getExpertMonthlyAvailabilityRules,
  getExpertAvailabilityOverrides,
  getExpertOneOffAvailability,
} from "@/lib/availability/data";
import { AvailabilityManager } from "@/components/expert/AvailabilityManager";

export default async function ExpertAvailabilityPage() {
  const supabase = await createClient();
  const { expertProfileId } = await requireApprovedExpertPage(supabase);

  const [settings, rules, overrides, oneOffs] = await Promise.all([
    getExpertAvailabilitySettings(supabase),
    getExpertMonthlyAvailabilityRules(supabase),
    getExpertAvailabilityOverrides(supabase),
    getExpertOneOffAvailability(supabase),
  ]);

  return (
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
  );
}
