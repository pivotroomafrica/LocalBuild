import { createClient } from "@/lib/supabase/server";
import {
  requireApprovedExpertPage,
  getExpertAvailabilitySettings,
  getExpertMonthlyAvailabilityRules,
  getExpertOneOffAvailability,
  getExpertUnavailableDates,
} from "@/lib/availability/data";
import { AvailabilityManager } from "@/components/expert/AvailabilityManager";
import { UnavailableDatesManager } from "@/components/expert/UnavailableDatesManager";

export default async function ExpertAvailabilityPage() {
  const supabase = await createClient();
  await requireApprovedExpertPage(supabase);

  const [settings, rules, oneOffs, unavailableDates] = await Promise.all([
    getExpertAvailabilitySettings(supabase),
    getExpertMonthlyAvailabilityRules(supabase),
    getExpertOneOffAvailability(supabase),
    getExpertUnavailableDates(supabase),
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
        initialTimezone={settings?.timezone ?? null}
        initialRules={rules}
        initialOneOffs={oneOffs}
        initialUnavailableDates={unavailableDates.map((d) => d.unavailable_date)}
      />

      <UnavailableDatesManager initialDates={unavailableDates.map((d) => d.unavailable_date)} />
    </div>
  );
}
