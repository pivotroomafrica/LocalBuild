import type { Tables } from "@/types/database";

export type ExpertAvailabilitySettings = Tables<"expert_availability_settings">;
export type ExpertAvailabilityWindow = Tables<"expert_availability_windows">;
export type ExpertUnavailableDate = Tables<"expert_unavailable_dates">;

/** ISO-style day numbering (1 = Monday ... 7 = Sunday), matching
 * expert_availability_windows.day_of_week (019_expert_availability_tables.sql). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type DayOfWeek = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<DayOfWeek, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/** Fallback when the browser's own timezone can't be detected (spec
 * section 10) -- never inferred from country/city, no geocoding. */
export const DEFAULT_TIMEZONE = "Africa/Addis_Ababa";

/** One weekly window as edited in the UI and sent to
 * save_expert_availability_schedule() -- "HH:MM" strings on a 15-minute
 * grid. This is the shape the RPC's `windows` jsonb parameter expects. */
export type AvailabilityWindowInput = {
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
};
