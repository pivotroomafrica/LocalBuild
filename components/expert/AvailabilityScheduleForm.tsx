"use client";

import { useMemo, useState, useTransition } from "react";
import { saveAvailabilityScheduleAction } from "@/lib/availability/actions";
import { validateAvailabilityWindows } from "@/lib/availability/engine";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { WEEKDAYS, WEEKDAY_LABELS, DEFAULT_TIMEZONE, type AvailabilityWindowInput, type DayOfWeek } from "@/types/availability";

type WindowRow = { start_time: string; end_time: string };

type Props = {
  initialTimezone: string | null;
  initialWindows: AvailabilityWindowInput[];
};

function detectBrowserTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function timezoneOptions(): string[] {
  try {
    // Modern runtime feature -- falls back to a short hand list below if
    // unavailable, so the picker still works, just with fewer choices.
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (supported) return supported("timeZone");
  } catch {
    // fall through to the manual list
  }
  return [
    "Africa/Addis_Ababa",
    "Africa/Nairobi",
    "Africa/Lagos",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "Europe/London",
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Dubai",
    "Asia/Kolkata",
    "UTC",
  ];
}

function groupByDay(windows: AvailabilityWindowInput[]): Record<DayOfWeek, WindowRow[]> {
  const grouped = Object.fromEntries(WEEKDAYS.map((d) => [d, [] as WindowRow[]])) as Record<DayOfWeek, WindowRow[]>;
  for (const w of windows) {
    grouped[w.day_of_week].push({ start_time: w.start_time.slice(0, 5), end_time: w.end_time.slice(0, 5) });
  }
  for (const day of WEEKDAYS) {
    grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return grouped;
}

export function AvailabilityScheduleForm({ initialTimezone, initialWindows }: Props) {
  const [timezone, setTimezone] = useState(initialTimezone ?? detectBrowserTimezone());
  const [schedule, setSchedule] = useState<Record<DayOfWeek, WindowRow[]>>(() => groupByDay(initialWindows));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const tzOptions = useMemo(() => timezoneOptions(), []);
  const timezoneChanged = initialTimezone != null && timezone !== initialTimezone;

  function toggleDay(day: DayOfWeek, available: boolean) {
    setSuccess(false);
    setSchedule((prev) => ({
      ...prev,
      [day]: available ? (prev[day].length > 0 ? prev[day] : [{ start_time: "09:00", end_time: "17:00" }]) : [],
    }));
  }

  function addWindow(day: DayOfWeek) {
    setSuccess(false);
    setSchedule((prev) => ({ ...prev, [day]: [...prev[day], { start_time: "09:00", end_time: "17:00" }] }));
  }

  function removeWindow(day: DayOfWeek, index: number) {
    setSuccess(false);
    setSchedule((prev) => ({ ...prev, [day]: prev[day].filter((_, i) => i !== index) }));
  }

  function updateWindow(day: DayOfWeek, index: number, field: "start_time" | "end_time", value: string) {
    setSuccess(false);
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day].map((w, i) => (i === index ? { ...w, [field]: value } : w)),
    }));
  }

  function handleSave() {
    setError(null);
    setSuccess(false);

    const windows: AvailabilityWindowInput[] = WEEKDAYS.flatMap((day) =>
      schedule[day].map((w) => ({ day_of_week: day, start_time: w.start_time, end_time: w.end_time })),
    );

    const clientCheck = validateAvailabilityWindows(windows);
    if (!clientCheck.valid) {
      setError(clientCheck.error);
      return;
    }

    startTransition(async () => {
      const result = await saveAvailabilityScheduleAction(timezone, windows);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Timezone</h2>
        <select
          value={timezone}
          onChange={(event) => {
            setTimezone(event.target.value);
            setSuccess(false);
          }}
          className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)]"
        >
          {!tzOptions.includes(timezone) ? <option value={timezone}>{timezone}</option> : null}
          {tzOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {timezoneChanged ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Changing your timezone keeps your saved hours but interprets them in the new timezone.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Weekly Availability</h2>
        {WEEKDAYS.map((day) => {
          const windows = schedule[day];
          const isAvailable = windows.length > 0;
          return (
            <div key={day} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--color-text)]">{WEEKDAY_LABELS[day]}</span>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={(event) => toggleDay(day, event.target.checked)}
                    className="h-4 w-4"
                  />
                  Available
                </label>
              </div>

              {isAvailable ? (
                <div className="mt-3 flex flex-col gap-2">
                  {windows.map((w, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="time"
                        step={900}
                        value={w.start_time}
                        onChange={(event) => updateWindow(day, index, "start_time", event.target.value)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                      />
                      <span className="text-xs text-[var(--color-text-muted)]">to</span>
                      <input
                        type="time"
                        step={900}
                        value={w.end_time}
                        onChange={(event) => updateWindow(day, index, "end_time", event.target.value)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
                      />
                      <button
                        type="button"
                        onClick={() => removeWindow(day, index)}
                        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addWindow(day)}
                    className="self-start text-xs font-medium text-[var(--color-brand)] hover:underline"
                  >
                    + Add hours
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">Unavailable</p>
              )}
            </div>
          );
        })}
      </section>

      {error ? <FormMessage variant="error">{error}</FormMessage> : null}
      {success ? <FormMessage variant="success">Availability saved.</FormMessage> : null}

      <Button type="button" onClick={handleSave} isLoading={isPending} loadingText="Saving...">
        Save Availability
      </Button>
    </div>
  );
}
