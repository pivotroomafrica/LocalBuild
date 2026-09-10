"use client";

import { useMemo, useState, useTransition } from "react";
import {
  setTimezoneAction,
  addMonthlyRuleAction,
  updateMonthlyRuleAction,
  removeMonthlyRuleAction,
  setMonthOverrideAction,
  removeMonthOverrideAction,
  addOneOffAvailabilityAction,
  updateOneOffAvailabilityAction,
  removeOneOffAvailabilityAction,
} from "@/lib/availability/actions";
import {
  durationMinutes,
  formatDuration,
  formatMonthlyRuleLabel,
  getMonthTotalMinutes,
  getRecurringMonthlyMinutes,
  getUpcomingMonths,
  monthLabel as formatMonthLabel,
  oneOffOverlapsExisting,
  ruleOverlapsExisting,
  validateTimeRange,
  wouldExceedRecurringCap,
} from "@/lib/availability/engine";
import { FormMessage } from "@/components/ui/FormMessage";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AddExtraTimeModal } from "@/components/expert/AddExtraTimeModal";
import {
  DAY_OF_MONTH_VALUES,
  DEFAULT_TIMEZONE,
  MAX_RECURRING_MONTHLY_MINUTES,
  RECOMMENDED_MIN_MONTHLY_MINUTES,
  type ExpertAvailabilityOverride,
  type ExpertMonthlyAvailabilityRule,
  type ExpertOneOffAvailability,
  type MonthlyRuleInput,
  type OneOffAvailabilityInput,
} from "@/types/availability";

type Props = {
  expertProfileId: string;
  initialTimezone: string | null;
  initialRules: ExpertMonthlyAvailabilityRule[];
  initialOverrides: ExpertAvailabilityOverride[];
  initialOneOffs: ExpertOneOffAvailability[];
};

const UPCOMING_MONTHS_AHEAD = 6;

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function timezoneOptions(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (supported) return supported("timeZone");
  } catch {
    // fall through
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

function toRuleInput(r: { day_of_month: number; start_time: string; end_time: string }): MonthlyRuleInput {
  return { day_of_month: r.day_of_month, start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5) };
}

function toOneOffInput(o: { available_date: string; start_time: string; end_time: string }): OneOffAvailabilityInput {
  return { available_date: o.available_date, start_time: o.start_time.slice(0, 5), end_time: o.end_time.slice(0, 5) };
}

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function occurrenceKey(ruleId: string, originalDate: string): string {
  return `${ruleId}|${originalDate}`;
}

/** DB rows carry "HH:MM:SS" time strings; every locally-created override
 * in this component stores the "HH:MM" a <input type="time"> gives back.
 * Trimmed on load so display and comparisons stay consistent regardless
 * of a row's origin. */
function normalizeOverride(o: ExpertAvailabilityOverride): ExpertAvailabilityOverride {
  return {
    ...o,
    start_time: o.start_time ? o.start_time.slice(0, 5) : o.start_time,
    end_time: o.end_time ? o.end_time.slice(0, 5) : o.end_time,
  };
}

export function AvailabilityManager({
  expertProfileId,
  initialTimezone,
  initialRules,
  initialOverrides,
  initialOneOffs,
}: Props) {
  const [timezone, setTimezone] = useState(initialTimezone ?? detectBrowserTimezone());
  const [rules, setRules] = useState(initialRules.map((r) => ({ ...toRuleInput(r), id: r.id })));
  const [overrides, setOverrides] = useState<ExpertAvailabilityOverride[]>(initialOverrides.map(normalizeOverride));
  const [oneOffs, setOneOffs] = useState(initialOneOffs.map((o) => ({ ...toOneOffInput(o), id: o.id })));

  const [tzError, setTzError] = useState<string | null>(null);
  const [tzSaved, setTzSaved] = useState(false);
  const [isTzPending, startTzTransition] = useTransition();

  // Recurring rule add/edit form
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [dayOfMonth, setDayOfMonth] = useState(15);
  const [ruleStartTime, setRuleStartTime] = useState("15:00");
  const [ruleEndTime, setRuleEndTime] = useState("16:00");
  const [ruleFormError, setRuleFormError] = useState<string | null>(null);
  const [isSavingRule, startSaveRuleTransition] = useTransition();

  // Per-occurrence override edit form (Upcoming Months)
  const [editingOccurrence, setEditingOccurrence] = useState<{ ruleId: string; originalDate: string } | null>(null);
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideStartTime, setOverrideStartTime] = useState("15:00");
  const [overrideEndTime, setOverrideEndTime] = useState("16:00");
  const [overrideFormError, setOverrideFormError] = useState<string | null>(null);
  const [isSavingOverride, startSaveOverrideTransition] = useTransition();

  // One-off (specific date) add/edit form
  const [showOneOffForm, setShowOneOffForm] = useState(false);
  const [editingOneOffId, setEditingOneOffId] = useState<string | null>(null);
  const [oneOffDate, setOneOffDate] = useState("");
  const [oneOffStartTime, setOneOffStartTime] = useState("15:00");
  const [oneOffEndTime, setOneOffEndTime] = useState("16:00");
  const [oneOffFormError, setOneOffFormError] = useState<string | null>(null);
  const [isSavingOneOff, startSaveOneOffTransition] = useTransition();

  // Add Extra Time modal (Upcoming Months -> "+ Add Time")
  const [addTimeMonth, setAddTimeMonth] = useState<{ year: number; month: number; label: string } | null>(null);

  // Shared confirmation dialog for destructive availability actions
  // (Skip, Remove) -- replaces window.confirm() everywhere.
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => Promise<{ error?: string } | void>;
  } | null>(null);

  const tzOptions = useMemo(() => timezoneOptions(), []);

  const recurringMinutes = getRecurringMonthlyMinutes(rules);
  const today = new Date();

  const ruleRows = useMemo(
    () =>
      rules.map((r) => ({
        id: r.id,
        expert_profile_id: expertProfileId,
        day_of_month: r.day_of_month,
        start_time: r.start_time,
        end_time: r.end_time,
        created_at: "",
        updated_at: "",
      })),
    [rules, expertProfileId],
  );

  const oneOffRows = useMemo(
    () =>
      oneOffs.map((o) => ({
        id: o.id,
        expert_profile_id: expertProfileId,
        available_date: o.available_date,
        start_time: o.start_time,
        end_time: o.end_time,
        created_at: "",
        updated_at: "",
      })),
    [oneOffs, expertProfileId],
  );

  const thisMonthMinutes = getMonthTotalMinutes(ruleRows, overrides, oneOffRows, today.getFullYear(), today.getMonth() + 1);

  const upcomingMonths = useMemo(
    () => getUpcomingMonths(ruleRows, overrides, UPCOMING_MONTHS_AHEAD, today.getFullYear(), today.getMonth() + 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruleRows, overrides],
  );

  function handleTimezoneChange(newTimezone: string) {
    setTimezone(newTimezone);
    setTzError(null);
    setTzSaved(false);
    startTzTransition(async () => {
      const result = await setTimezoneAction(newTimezone);
      if (result.error) {
        setTzError(result.error);
        return;
      }
      setTzSaved(true);
    });
  }

  // ---- Recurring rules ----

  function openAddRule() {
    setEditingRuleId(null);
    setDayOfMonth(15);
    setRuleStartTime("15:00");
    setRuleEndTime("16:00");
    setRuleFormError(null);
    setShowRuleForm(true);
  }

  function openEditRule(rule: MonthlyRuleInput & { id: string }) {
    setEditingRuleId(rule.id);
    setDayOfMonth(rule.day_of_month);
    setRuleStartTime(rule.start_time);
    setRuleEndTime(rule.end_time);
    setRuleFormError(null);
    setShowRuleForm(true);
  }

  function closeRuleForm() {
    setShowRuleForm(false);
    setEditingRuleId(null);
    setRuleFormError(null);
  }

  function handleSubmitRule() {
    setRuleFormError(null);
    const timeCheck = validateTimeRange(ruleStartTime, ruleEndTime);
    if (!timeCheck.valid) {
      setRuleFormError(timeCheck.error);
      return;
    }

    const candidate: MonthlyRuleInput = { day_of_month: dayOfMonth, start_time: ruleStartTime, end_time: ruleEndTime };
    const otherRules = rules.filter((r) => r.id !== editingRuleId);

    if (ruleOverlapsExisting(otherRules, candidate)) {
      setRuleFormError("This overlaps an existing monthly rule.");
      return;
    }
    if (wouldExceedRecurringCap(otherRules, candidate)) {
      setRuleFormError("Pivotroom currently supports up to 5 hours of recurring availability per month.");
      return;
    }

    startSaveRuleTransition(async () => {
      const result = editingRuleId
        ? await updateMonthlyRuleAction(editingRuleId, candidate)
        : await addMonthlyRuleAction(candidate);
      if (result.error) {
        setRuleFormError(result.error);
        return;
      }
      if (editingRuleId) {
        setRules((prev) => prev.map((r) => (r.id === editingRuleId ? { ...candidate, id: editingRuleId } : r)));
      } else if (result.id) {
        setRules((prev) => [...prev, { ...candidate, id: result.id! }]);
      }
      closeRuleForm();
    });
  }

  function handleRemoveRule(id: string) {
    setPendingConfirm({
      title: "Remove this availability?",
      description: "Any months you've customized for it will be removed too. This can't be undone.",
      confirmLabel: "Remove",
      onConfirm: async () => {
        const result = await removeMonthlyRuleAction(id);
        if (!result.error) {
          setRules((prev) => prev.filter((r) => r.id !== id));
          setOverrides((prev) => prev.filter((o) => o.recurring_rule_id !== id));
          setPendingConfirm(null);
        }
        return result;
      },
    });
  }

  // ---- Per-occurrence overrides (Upcoming Months) ----

  function openEditOccurrence(ruleId: string, originalDate: string, currentStart: string, currentEnd: string) {
    setEditingOccurrence({ ruleId, originalDate });
    setOverrideDate(originalDate);
    setOverrideStartTime(currentStart);
    setOverrideEndTime(currentEnd);
    setOverrideFormError(null);
  }

  function closeOccurrenceForm() {
    setEditingOccurrence(null);
    setOverrideFormError(null);
  }

  function upsertOverrideLocally(input: {
    ruleId: string;
    originalDate: string;
    overrideType: "modified" | "skipped";
    overrideDate?: string;
    startTime?: string;
    endTime?: string;
    id: string;
  }) {
    setOverrides((prev) => {
      const filtered = prev.filter(
        (o) => !(o.recurring_rule_id === input.ruleId && o.original_date === input.originalDate),
      );
      const row: ExpertAvailabilityOverride = {
        id: input.id,
        expert_profile_id: expertProfileId,
        recurring_rule_id: input.ruleId,
        original_date: input.originalDate,
        override_type: input.overrideType,
        override_date: input.overrideType === "modified" ? (input.overrideDate ?? null) : null,
        start_time: input.overrideType === "modified" ? (input.startTime ?? null) : null,
        end_time: input.overrideType === "modified" ? (input.endTime ?? null) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return [...filtered, row];
    });
  }

  function handleSubmitOccurrenceEdit() {
    if (!editingOccurrence) return;
    setOverrideFormError(null);
    const timeCheck = validateTimeRange(overrideStartTime, overrideEndTime);
    if (!timeCheck.valid) {
      setOverrideFormError(timeCheck.error);
      return;
    }
    if (!overrideDate) {
      setOverrideFormError("Please choose a date.");
      return;
    }

    const { ruleId, originalDate } = editingOccurrence;
    startSaveOverrideTransition(async () => {
      const result = await setMonthOverrideAction({
        recurringRuleId: ruleId,
        originalDate,
        overrideType: "modified",
        overrideDate,
        startTime: overrideStartTime,
        endTime: overrideEndTime,
      });
      if (result.error) {
        setOverrideFormError(result.error);
        return;
      }
      if (result.id) {
        upsertOverrideLocally({
          ruleId,
          originalDate,
          overrideType: "modified",
          overrideDate,
          startTime: overrideStartTime,
          endTime: overrideEndTime,
          id: result.id,
        });
      }
      closeOccurrenceForm();
    });
  }

  function handleSkipOccurrence(ruleId: string, originalDate: string) {
    const [y, m] = originalDate.split("-").map(Number);
    const label = formatMonthLabel(y, m);
    setPendingConfirm({
      title: `Skip ${label} availability?`,
      description: (
        <>
          Your regular availability will be skipped for this month only. Your normal schedule will continue again
          next month.
        </>
      ),
      confirmLabel: `Skip ${label}`,
      onConfirm: async () => {
        const result = await setMonthOverrideAction({ recurringRuleId: ruleId, originalDate, overrideType: "skipped" });
        if (result.error) return result;
        if (result.id) {
          upsertOverrideLocally({ ruleId, originalDate, overrideType: "skipped", id: result.id });
        }
        setPendingConfirm(null);
      },
    });
  }

  function handleRestoreOccurrence(overrideId: string, ruleId: string, originalDate: string) {
    startSaveOverrideTransition(async () => {
      const result = await removeMonthOverrideAction(overrideId);
      if (result.error) return;
      setOverrides((prev) => prev.filter((o) => !(o.recurring_rule_id === ruleId && o.original_date === originalDate)));
    });
  }

  // ---- One-off (specific date) availability ----

  function openAddOneOff(prefillDate?: string) {
    setEditingOneOffId(null);
    setOneOffDate(prefillDate ?? "");
    setOneOffStartTime("15:00");
    setOneOffEndTime("16:00");
    setOneOffFormError(null);
    setShowOneOffForm(true);
  }

  function openEditOneOff(oneOff: OneOffAvailabilityInput & { id: string }) {
    setEditingOneOffId(oneOff.id);
    setOneOffDate(oneOff.available_date);
    setOneOffStartTime(oneOff.start_time);
    setOneOffEndTime(oneOff.end_time);
    setOneOffFormError(null);
    setShowOneOffForm(true);
  }

  function closeOneOffForm() {
    setShowOneOffForm(false);
    setEditingOneOffId(null);
    setOneOffFormError(null);
  }

  function handleSubmitOneOff() {
    setOneOffFormError(null);
    const timeCheck = validateTimeRange(oneOffStartTime, oneOffEndTime);
    if (!timeCheck.valid) {
      setOneOffFormError(timeCheck.error);
      return;
    }
    if (!oneOffDate) {
      setOneOffFormError("Please choose a date.");
      return;
    }

    const candidate: OneOffAvailabilityInput = { available_date: oneOffDate, start_time: oneOffStartTime, end_time: oneOffEndTime };
    const otherOneOffs = oneOffs.filter((o) => o.id !== editingOneOffId);

    if (oneOffOverlapsExisting(otherOneOffs, candidate)) {
      setOneOffFormError("This overlaps availability you already added for that date.");
      return;
    }

    startSaveOneOffTransition(async () => {
      const result = editingOneOffId
        ? await updateOneOffAvailabilityAction(editingOneOffId, candidate)
        : await addOneOffAvailabilityAction(candidate);
      if (result.error) {
        setOneOffFormError(result.error);
        return;
      }
      if (editingOneOffId) {
        setOneOffs((prev) => prev.map((o) => (o.id === editingOneOffId ? { ...candidate, id: editingOneOffId } : o)));
      } else if (result.id) {
        setOneOffs((prev) => [...prev, { ...candidate, id: result.id! }]);
      }
      closeOneOffForm();
    });
  }

  function handleRemoveOneOff(id: string) {
    setPendingConfirm({
      title: "Remove this availability?",
      description: "This specific-date availability will be removed. This can't be undone.",
      confirmLabel: "Remove",
      onConfirm: async () => {
        const result = await removeOneOffAvailabilityAction(id);
        if (!result.error) {
          setOneOffs((prev) => prev.filter((o) => o.id !== id));
          setPendingConfirm(null);
        }
        return result;
      },
    });
  }

  const recurringMessage =
    recurringMinutes === 0
      ? null
      : recurringMinutes < RECOMMENDED_MIN_MONTHLY_MINUTES
        ? "Pivotroom recommends making at least 1 hour available each month."
        : recurringMinutes >= MAX_RECURRING_MONTHLY_MINUTES
          ? "You've reached Pivotroom's current 5-hour monthly availability limit."
          : null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Timezone</h2>
        <select
          value={timezone}
          onChange={(event) => handleTimezoneChange(event.target.value)}
          className="w-full max-w-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)]"
        >
          {!tzOptions.includes(timezone) ? <option value={timezone}>{timezone}</option> : null}
          {tzOptions.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {tzError ? <FormMessage variant="error">{tzError}</FormMessage> : null}
        {tzSaved && !isTzPending ? <p className="text-xs text-[var(--color-success)]">Timezone saved.</p> : null}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Regular Monthly Availability</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Time that repeats every month, on the same day of the month. You can edit, skip, or add extra time for any
            single month below without changing this regular plan.
          </p>
        </div>

        {rules.length === 0 && !showRuleForm ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] p-4 text-center">
            <p className="text-sm text-[var(--color-text)]">No regular availability added yet.</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Make 1–5 hours available each month. You can use a recurring day of the month or add a specific date below.
            </p>
          </div>
        ) : null}

        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
          >
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">{formatMonthlyRuleLabel(rule)}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {rule.start_time}–{rule.end_time} · {formatDuration(durationMinutes(rule.start_time, rule.end_time))}
              </p>
            </div>
            <div className="flex gap-3 text-xs font-medium">
              <button type="button" onClick={() => openEditRule(rule)} className="text-[var(--color-brand)] hover:underline">
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleRemoveRule(rule.id)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {!showRuleForm ? (
          <button
            type="button"
            onClick={openAddRule}
            className="self-start text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            + Add Regular Availability
          </button>
        ) : (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
              {editingRuleId ? "Edit Regular Availability" : "Add Regular Availability"}
            </h3>

            {ruleFormError ? (
              <div className="mb-3">
                <FormMessage variant="error">{ruleFormError}</FormMessage>
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-[var(--color-text-muted)]">
                Day of the month
                <select
                  value={dayOfMonth}
                  onChange={(event) => setDayOfMonth(Number(event.target.value))}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
                >
                  {DAY_OF_MONTH_VALUES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  step={900}
                  value={ruleStartTime}
                  onChange={(event) => setRuleStartTime(event.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                />
                <span className="text-xs text-[var(--color-text-muted)]">to</span>
                <input
                  type="time"
                  step={900}
                  value={ruleEndTime}
                  onChange={(event) => setRuleEndTime(event.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                {formatMonthlyRuleLabel({ day_of_month: dayOfMonth })}, {ruleStartTime}–{ruleEndTime}
              </p>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleSubmitRule}
                disabled={isSavingRule}
                className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingRule ? "Saving..." : editingRuleId ? "Save Changes" : "Add Availability"}
              </button>
              <button
                type="button"
                onClick={closeRuleForm}
                className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Upcoming Months</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            What your regular schedule works out to for each of the next {UPCOMING_MONTHS_AHEAD} months. Edit, skip, or
            restore any single month without changing your regular plan above.
          </p>
        </div>

        {rules.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">Add regular availability above to see upcoming months.</p>
        ) : (
          upcomingMonths.map((monthEntry) => {
            const monthTotalMinutes = getMonthTotalMinutes(
              ruleRows,
              overrides,
              oneOffRows,
              monthEntry.year,
              monthEntry.month,
            );

            return (
            <div key={`${monthEntry.year}-${monthEntry.month}`} className="rounded-md border border-[var(--color-border)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">{monthEntry.label}</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {monthEntry.label} total: {formatDuration(monthTotalMinutes)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAddTimeMonth({ year: monthEntry.year, month: monthEntry.month, label: monthEntry.label })
                  }
                  className="text-xs font-medium text-[var(--color-brand)] hover:underline"
                >
                  + Add Time
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {monthEntry.occurrences.map((occurrence) => {
                  const key = occurrenceKey(occurrence.ruleId, occurrence.originalDate);
                  const isEditing = editingOccurrence && occurrenceKey(editingOccurrence.ruleId, editingOccurrence.originalDate) === key;

                  return (
                    <div key={key} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      {occurrence.status === "regular" ? (
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-[var(--color-text)]">
                            {occurrence.displayDate} · {occurrence.start_time}–{occurrence.end_time}
                          </p>
                          <div className="flex gap-3 text-xs font-medium">
                            <button
                              type="button"
                              onClick={() =>
                                openEditOccurrence(occurrence.ruleId, occurrence.originalDate, occurrence.start_time, occurrence.end_time)
                              }
                              className="text-[var(--color-brand)] hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSkipOccurrence(occurrence.ruleId, occurrence.originalDate)}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                            >
                              Skip
                            </button>
                          </div>
                        </div>
                      ) : occurrence.status === "modified" ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-[var(--color-text)]">
                              Moved to {occurrence.displayDate} · {occurrence.start_time}–{occurrence.end_time}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">Usually {occurrence.originalDate}</p>
                          </div>
                          <div className="flex gap-3 text-xs font-medium">
                            <button
                              type="button"
                              onClick={() =>
                                openEditOccurrence(occurrence.ruleId, occurrence.originalDate, occurrence.start_time, occurrence.end_time)
                              }
                              className="text-[var(--color-brand)] hover:underline"
                            >
                              Edit
                            </button>
                            {occurrence.overrideId ? (
                              <button
                                type="button"
                                onClick={() => handleRestoreOccurrence(occurrence.overrideId!, occurrence.ruleId, occurrence.originalDate)}
                                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                              >
                                Restore Regular Time
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-[var(--color-text-muted)]">
                            Skipped this month (usually {occurrence.originalDate}, {occurrence.start_time}–{occurrence.end_time})
                          </p>
                          {occurrence.overrideId ? (
                            <button
                              type="button"
                              onClick={() => handleRestoreOccurrence(occurrence.overrideId!, occurrence.ruleId, occurrence.originalDate)}
                              className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                            >
                              Restore Regular Time
                            </button>
                          ) : null}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                          {overrideFormError ? (
                            <div className="mb-2">
                              <FormMessage variant="error">{overrideFormError}</FormMessage>
                            </div>
                          ) : null}
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                              type="date"
                              min={todayLocalDateString()}
                              value={overrideDate}
                              onChange={(event) => setOverrideDate(event.target.value)}
                              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                            />
                            <input
                              type="time"
                              step={900}
                              value={overrideStartTime}
                              onChange={(event) => setOverrideStartTime(event.target.value)}
                              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                            />
                            <span className="text-xs text-[var(--color-text-muted)]">to</span>
                            <input
                              type="time"
                              step={900}
                              value={overrideEndTime}
                              onChange={(event) => setOverrideEndTime(event.target.value)}
                              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div className="mt-3 flex gap-3">
                            <button
                              type="button"
                              onClick={handleSubmitOccurrenceEdit}
                              disabled={isSavingOverride}
                              className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isSavingOverride ? "Saving..." : "Save for This Month"}
                            </button>
                            <button
                              type="button"
                              onClick={closeOccurrenceForm}
                              className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Specific Dates</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            One-time availability that doesn&apos;t repeat -- for extra time in a given month, or if you have no regular
            plan at all.
          </p>
        </div>

        {oneOffs.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">No specific-date availability added.</p>
        ) : (
          oneOffs.map((oneOff) => (
            <div
              key={oneOff.id}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">{oneOff.available_date}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {oneOff.start_time}–{oneOff.end_time} ·{" "}
                  {formatDuration(durationMinutes(oneOff.start_time, oneOff.end_time))}
                </p>
              </div>
              <div className="flex gap-3 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => openEditOneOff(oneOff)}
                  className="text-[var(--color-brand)] hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveOneOff(oneOff.id)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}

        {!showOneOffForm ? (
          <button
            type="button"
            onClick={() => openAddOneOff()}
            className="self-start text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            + Add a specific date
          </button>
        ) : (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
              {editingOneOffId ? "Edit Specific-Date Availability" : "Add Specific-Date Availability"}
            </h3>

            {oneOffFormError ? (
              <div className="mb-3">
                <FormMessage variant="error">{oneOffFormError}</FormMessage>
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <input
                type="date"
                min={todayLocalDateString()}
                value={oneOffDate}
                onChange={(event) => setOneOffDate(event.target.value)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  step={900}
                  value={oneOffStartTime}
                  onChange={(event) => setOneOffStartTime(event.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                />
                <span className="text-xs text-[var(--color-text-muted)]">to</span>
                <input
                  type="time"
                  step={900}
                  value={oneOffEndTime}
                  onChange={(event) => setOneOffEndTime(event.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleSubmitOneOff}
                disabled={isSavingOneOff}
                className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingOneOff ? "Saving..." : editingOneOffId ? "Save Changes" : "Add Availability"}
              </button>
              <button
                type="button"
                onClick={closeOneOffForm}
                className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Monthly Time</h2>
        <p className="text-sm text-[var(--color-text)]">
          Regular plan: <span className="font-medium">{formatDuration(recurringMinutes)}/month</span>
        </p>
        {thisMonthMinutes !== recurringMinutes ? (
          <p className="mt-1 text-sm text-[var(--color-text)]">
            This month: <span className="font-medium">{formatDuration(thisMonthMinutes)} available</span>
          </p>
        ) : null}
        {recurringMessage ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">{recurringMessage}</p> : null}
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">Pivotroom recommends 1–5 hours per month.</p>
      </section>

      {addTimeMonth ? (
        <AddExtraTimeModal
          open
          year={addTimeMonth.year}
          month={addTimeMonth.month}
          monthLabel={addTimeMonth.label}
          ruleRows={ruleRows}
          overrides={overrides}
          oneOffRows={oneOffRows}
          onClose={() => setAddTimeMonth(null)}
          onAdded={(oneOff) => {
            setOneOffs((prev) => [...prev, oneOff]);
            setAddTimeMonth(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        description={pendingConfirm?.description ?? null}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Confirm"}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => pendingConfirm!.onConfirm()}
      />
    </div>
  );
}
