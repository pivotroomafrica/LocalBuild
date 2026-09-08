"use client";

import { useMemo, useState, useTransition } from "react";
import {
  setTimezoneAction,
  addMonthlyRuleAction,
  updateMonthlyRuleAction,
  removeMonthlyRuleAction,
  addOneOffAvailabilityAction,
  updateOneOffAvailabilityAction,
  removeOneOffAvailabilityAction,
} from "@/lib/availability/actions";
import {
  durationMinutes,
  formatDuration,
  formatMonthlyRuleLabel,
  getAvailabilityMinutesForMonth,
  getRecurringMonthlyMinutes,
  oneOffOverlapsExisting,
  ruleOverlapsExisting,
  validateTimeRange,
} from "@/lib/availability/engine";
import { FormMessage } from "@/components/ui/FormMessage";
import {
  DEFAULT_TIMEZONE,
  MAX_RECURRING_MONTHLY_MINUTES,
  RECOMMENDED_MIN_MONTHLY_MINUTES,
  WEEK_OF_MONTH_LABELS,
  WEEK_OF_MONTH_VALUES,
  WEEKDAY_LABELS,
  WEEKDAYS,
  type DayOfWeek,
  type ExpertMonthlyAvailabilityRule,
  type ExpertOneOffAvailability,
  type MonthlyRuleInput,
  type OneOffAvailabilityInput,
  type WeekOfMonth,
} from "@/types/availability";

type Props = {
  initialTimezone: string | null;
  initialRules: ExpertMonthlyAvailabilityRule[];
  initialOneOffs: ExpertOneOffAvailability[];
  initialUnavailableDates: string[];
};

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

type AddType = "monthly" | "specific";

function toRuleInput(r: { week_of_month: string; day_of_week: number; start_time: string; end_time: string }): MonthlyRuleInput {
  return {
    week_of_month: r.week_of_month as WeekOfMonth,
    day_of_week: r.day_of_week as DayOfWeek,
    start_time: r.start_time.slice(0, 5),
    end_time: r.end_time.slice(0, 5),
  };
}

function toOneOffInput(o: { available_date: string; start_time: string; end_time: string }): OneOffAvailabilityInput {
  return { available_date: o.available_date, start_time: o.start_time.slice(0, 5), end_time: o.end_time.slice(0, 5) };
}

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function AvailabilityManager({ initialTimezone, initialRules, initialOneOffs, initialUnavailableDates }: Props) {
  const [timezone, setTimezone] = useState(initialTimezone ?? detectBrowserTimezone());
  const [rules, setRules] = useState(initialRules.map((r) => ({ ...toRuleInput(r), id: r.id })));
  const [oneOffs, setOneOffs] = useState(initialOneOffs.map((o) => ({ ...toOneOffInput(o), id: o.id })));

  const [tzError, setTzError] = useState<string | null>(null);
  const [tzSaved, setTzSaved] = useState(false);
  const [isTzPending, startTzTransition] = useTransition();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingOneOffId, setEditingOneOffId] = useState<string | null>(null);
  const [addType, setAddType] = useState<AddType>("monthly");
  const [weekOfMonth, setWeekOfMonth] = useState<WeekOfMonth>("first");
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(1);
  const [availableDate, setAvailableDate] = useState("");
  const [startTime, setStartTime] = useState("15:00");
  const [endTime, setEndTime] = useState("16:00");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  const tzOptions = useMemo(() => timezoneOptions(), []);

  const recurringMinutes = getRecurringMonthlyMinutes(rules);
  const today = new Date();
  const thisMonthMinutes = getAvailabilityMinutesForMonth(
    rules,
    oneOffs,
    initialUnavailableDates,
    today.getFullYear(),
    today.getMonth() + 1,
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

  function openAddForm(type: AddType) {
    setEditingRuleId(null);
    setEditingOneOffId(null);
    setAddType(type);
    setWeekOfMonth("first");
    setDayOfWeek(1);
    setAvailableDate("");
    setStartTime("15:00");
    setEndTime("16:00");
    setFormError(null);
    setShowAddForm(true);
  }

  function openEditRule(rule: MonthlyRuleInput & { id: string }) {
    setShowAddForm(true);
    setAddType("monthly");
    setEditingRuleId(rule.id);
    setEditingOneOffId(null);
    setWeekOfMonth(rule.week_of_month);
    setDayOfWeek(rule.day_of_week);
    setStartTime(rule.start_time);
    setEndTime(rule.end_time);
    setFormError(null);
  }

  function openEditOneOff(oneOff: OneOffAvailabilityInput & { id: string }) {
    setShowAddForm(true);
    setAddType("specific");
    setEditingOneOffId(oneOff.id);
    setEditingRuleId(null);
    setAvailableDate(oneOff.available_date);
    setStartTime(oneOff.start_time);
    setEndTime(oneOff.end_time);
    setFormError(null);
  }

  function closeForm() {
    setShowAddForm(false);
    setEditingRuleId(null);
    setEditingOneOffId(null);
    setFormError(null);
  }

  function handleSubmit() {
    setFormError(null);
    const timeCheck = validateTimeRange(startTime, endTime);
    if (!timeCheck.valid) {
      setFormError(timeCheck.error);
      return;
    }

    if (addType === "monthly") {
      const candidate: MonthlyRuleInput = { week_of_month: weekOfMonth, day_of_week: dayOfWeek, start_time: startTime, end_time: endTime };
      const otherRules = rules.filter((r) => r.id !== editingRuleId);

      if (ruleOverlapsExisting(otherRules, candidate)) {
        setFormError("This overlaps an existing monthly rule.");
        return;
      }
      const projectedTotal = getRecurringMonthlyMinutes(otherRules) + durationMinutes(startTime, endTime);
      if (projectedTotal > MAX_RECURRING_MONTHLY_MINUTES) {
        setFormError("Pivotroom currently supports up to 5 hours of recurring availability per month.");
        return;
      }

      startSaveTransition(async () => {
        const result = editingRuleId
          ? await updateMonthlyRuleAction(editingRuleId, candidate)
          : await addMonthlyRuleAction(candidate);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        if (editingRuleId) {
          setRules((prev) => prev.map((r) => (r.id === editingRuleId ? { ...candidate, id: editingRuleId } : r)));
        } else if (result.id) {
          setRules((prev) => [...prev, { ...candidate, id: result.id! }]);
        }
        closeForm();
      });
    } else {
      if (!availableDate) {
        setFormError("Please choose a date.");
        return;
      }
      const candidate: OneOffAvailabilityInput = { available_date: availableDate, start_time: startTime, end_time: endTime };
      const otherOneOffs = oneOffs.filter((o) => o.id !== editingOneOffId);

      if (oneOffOverlapsExisting(otherOneOffs, candidate)) {
        setFormError("This overlaps availability you already added for that date.");
        return;
      }

      startSaveTransition(async () => {
        const result = editingOneOffId
          ? await updateOneOffAvailabilityAction(editingOneOffId, candidate)
          : await addOneOffAvailabilityAction(candidate);
        if (result.error) {
          setFormError(result.error);
          return;
        }
        if (editingOneOffId) {
          setOneOffs((prev) => prev.map((o) => (o.id === editingOneOffId ? { ...candidate, id: editingOneOffId } : o)));
        } else if (result.id) {
          setOneOffs((prev) => [...prev, { ...candidate, id: result.id! }]);
        }
        closeForm();
      });
    }
  }

  function handleRemoveRule(id: string) {
    if (!window.confirm("Remove this availability?")) return;
    startSaveTransition(async () => {
      const result = await removeMonthlyRuleAction(id);
      if (!result.error) setRules((prev) => prev.filter((r) => r.id !== id));
    });
  }

  function handleRemoveOneOff(id: string) {
    if (!window.confirm("Remove this availability?")) return;
    startSaveTransition(async () => {
      const result = await removeOneOffAvailabilityAction(id);
      if (!result.error) setOneOffs((prev) => prev.filter((o) => o.id !== id));
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
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Monthly Availability</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Time that repeats every month, on the same week and weekday.
          </p>
        </div>

        {rules.length === 0 && oneOffs.length === 0 && !showAddForm ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] p-4 text-center">
            <p className="text-sm text-[var(--color-text)]">No availability added yet.</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Make 1–5 hours available each month. You can use a recurring monthly time or add a specific date.
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

        {!showAddForm ? (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => openAddForm("monthly")}
              className="self-start text-sm font-medium text-[var(--color-brand)] hover:underline"
            >
              + Add Availability
            </button>
          </div>
        ) : null}

        {showAddForm ? (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
              {editingRuleId || editingOneOffId ? "Edit Availability" : "How would you like to make time available?"}
            </h3>

            {!editingRuleId && !editingOneOffId ? (
              <div className="mb-4 flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="add_type"
                    checked={addType === "monthly"}
                    onChange={() => setAddType("monthly")}
                  />
                  Repeats monthly
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="add_type"
                    checked={addType === "specific"}
                    onChange={() => setAddType("specific")}
                  />
                  Specific date
                </label>
              </div>
            ) : null}

            {formError ? (
              <div className="mb-3">
                <FormMessage variant="error">{formError}</FormMessage>
              </div>
            ) : null}

            {addType === "monthly" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={weekOfMonth}
                    onChange={(event) => setWeekOfMonth(event.target.value as WeekOfMonth)}
                    className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                  >
                    {WEEK_OF_MONTH_VALUES.map((w) => (
                      <option key={w} value={w}>
                        {WEEK_OF_MONTH_LABELS[w]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={dayOfWeek}
                    onChange={(event) => setDayOfWeek(Number(event.target.value) as DayOfWeek)}
                    className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>
                        {WEEKDAY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    step={900}
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-[var(--color-text-muted)]">to</span>
                  <input
                    type="time"
                    step={900}
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                  />
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatMonthlyRuleLabel({ week_of_month: weekOfMonth, day_of_week: dayOfWeek })}, {startTime}–{endTime}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input
                  type="date"
                  min={todayLocalDateString()}
                  value={availableDate}
                  onChange={(event) => setAvailableDate(event.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    step={900}
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-[var(--color-text-muted)]">to</span>
                  <input
                    type="time"
                    step={900}
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSaving}
                className="inline-flex items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : editingRuleId || editingOneOffId ? "Save Changes" : "Add Availability"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Specific Dates</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            One-time availability that doesn&apos;t repeat.
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

        {!showAddForm ? (
          <button
            type="button"
            onClick={() => openAddForm("specific")}
            className="self-start text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            + Add a specific date
          </button>
        ) : null}
      </section>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Monthly Time</h2>
        <p className="text-sm text-[var(--color-text)]">
          Recurring: <span className="font-medium">{formatDuration(recurringMinutes)}/month</span>
        </p>
        {thisMonthMinutes !== recurringMinutes ? (
          <p className="mt-1 text-sm text-[var(--color-text)]">
            This month: <span className="font-medium">{formatDuration(thisMonthMinutes)} available</span>
          </p>
        ) : null}
        {recurringMessage ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">{recurringMessage}</p> : null}
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">Pivotroom recommends 1–5 hours per month.</p>
      </section>
    </div>
  );
}
