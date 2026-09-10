"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { FormMessage } from "@/components/ui/FormMessage";
import { addOneOffAvailabilityAction } from "@/lib/availability/actions";
import {
  durationMinutes,
  getEffectiveWindowsForDate,
  getMonthTotalMinutes,
  oneOffOverlapsExisting,
  validateTimeRange,
} from "@/lib/availability/engine";
import {
  MAX_RECURRING_MONTHLY_MINUTES,
  type ExpertAvailabilityOverride,
  type ExpertMonthlyAvailabilityRule,
  type ExpertOneOffAvailability,
  type OneOffAvailabilityInput,
} from "@/types/availability";

type Props = {
  open: boolean;
  year: number;
  month: number; // 1-12
  monthLabel: string;
  ruleRows: ExpertMonthlyAvailabilityRule[];
  overrides: ExpertAvailabilityOverride[];
  oneOffRows: ExpertOneOffAvailability[];
  onClose: () => void;
  onAdded: (oneOff: OneOffAvailabilityInput & { id: string }) => void;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * "+ Add Time" for one specific month in Upcoming Months. Saves through
 * the same secure one-off availability RPC as the Specific Dates section
 * below (`addOneOffAvailabilityAction` -> add_expert_one_off_availability())
 * -- there is no separate "extra time" table or RPC. The server is the
 * authority on every check here (overlap, cap, ownership); the checks in
 * this component are instant client-side feedback only, mirroring the
 * same engine functions the server-side RPC's logic is built from.
 */
export function AddExtraTimeModal({
  open,
  year,
  month,
  monthLabel,
  ruleRows,
  overrides,
  oneOffRows,
  onClose,
  onAdded,
}: Props) {
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
  const today = todayLocalDateString();
  const minDate = today > monthStart && today <= monthEnd ? today : monthStart;

  // No reset effect needed: the parent only mounts this component while
  // a month is selected (conditional rendering), so every open is a fresh
  // mount with fresh initial state -- no stale values to clear.
  const [date, setDate] = useState(minDate);
  const [startTime, setStartTime] = useState("15:00");
  const [endTime, setEndTime] = useState("16:00");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    if (isPending) return;
    onClose();
  }

  function handleSubmit() {
    setError(null);

    if (!date || date < monthStart || date > monthEnd) {
      setError(`Please choose a date in ${monthLabel}.`);
      return;
    }
    const timeCheck = validateTimeRange(startTime, endTime);
    if (!timeCheck.valid) {
      setError(timeCheck.error);
      return;
    }

    const candidate: OneOffAvailabilityInput = { available_date: date, start_time: startTime, end_time: endTime };

    if (oneOffOverlapsExisting(oneOffRows, candidate)) {
      setError("This overlaps availability you already added for that date.");
      return;
    }
    if (
      getEffectiveWindowsForDate(ruleRows, overrides, date).some(
        (w) => w.start_time < endTime && w.end_time > startTime,
      )
    ) {
      setError("This overlaps availability you already have on that date.");
      return;
    }
    const existingMinutes = getMonthTotalMinutes(ruleRows, overrides, oneOffRows, year, month);
    const candidateMinutes = durationMinutes(startTime, endTime);
    if (existingMinutes + candidateMinutes > MAX_RECURRING_MONTHLY_MINUTES) {
      setError("This would put that month over Pivotroom's availability limit.");
      return;
    }

    startTransition(async () => {
      const result = await addOneOffAvailabilityAction(candidate);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) {
        onAdded({ ...candidate, id: result.id });
      }
    });
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Add time in ${monthLabel}`} closeOnEscape={!isPending}>
      <div className="flex flex-col gap-3">
        {error ? <FormMessage variant="error">{error}</FormMessage> : null}

        <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
          Date
          <input
            type="date"
            min={monthStart}
            max={monthEnd}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </label>

        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--color-text-muted)]">
            From
            <input
              type="time"
              step={900}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--color-text-muted)]">
            To
            <input
              type="time"
              step={900}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)]"
            />
          </label>
        </div>

        <p className="text-xs text-[var(--color-text-muted)]">Times are in your configured timezone.</p>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={isPending}
          className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Adding..." : "Add Time"}
        </button>
      </div>
    </Modal>
  );
}
