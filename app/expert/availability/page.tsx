import { createClient } from "@/lib/supabase/server";
import {
  requireApprovedExpertPage,
  getExpertAvailabilitySettings,
  getExpertAvailabilityWindows,
  getExpertUnavailableDates,
} from "@/lib/availability/data";
import { AvailabilityScheduleForm } from "@/components/expert/AvailabilityScheduleForm";
import { UnavailableDatesManager } from "@/components/expert/UnavailableDatesManager";
import type { AvailabilityWindowInput, DayOfWeek } from "@/types/availability";

export default async function ExpertAvailabilityPage() {
  const supabase = await createClient();
  await requireApprovedExpertPage(supabase);

  const [settings, windows, unavailableDates] = await Promise.all([
    getExpertAvailabilitySettings(supabase),
    getExpertAvailabilityWindows(supabase),
    getExpertUnavailableDates(supabase),
  ]);

  const windowInputs: AvailabilityWindowInput[] = windows.map((w) => ({
    day_of_week: w.day_of_week as DayOfWeek,
    start_time: w.start_time,
    end_time: w.end_time,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Availability</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Set the regular hours when customers will eventually be able to book sessions with you.
        </p>
      </div>

      <AvailabilityScheduleForm initialTimezone={settings?.timezone ?? null} initialWindows={windowInputs} />

      <UnavailableDatesManager initialDates={unavailableDates.map((d) => d.unavailable_date)} />
    </div>
  );
}
