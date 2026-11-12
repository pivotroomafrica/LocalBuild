"use client";

import "./monthly-plan.css";
import { useState } from "react";
import {
  HOUR_CHOICES,
  TIME_BLOCKS,
  TIME_OPTIONS,
  WEEKDAYS,
  describePlan,
  openHoursPerMonth,
  planProblem,
  timeLabel,
  windowsOverlap,
  type AvailabilityPlan,
  type PlanWindow,
} from "@/lib/availability/plan";

const sameWindow = (a: PlanWindow, b: PlanWindow) => a.start === b.start && a.end === b.end;
const DATES = Array.from({ length: 28 }, (_, i) => i + 1);

/**
 * Hours a month, which days, which times. Controlled: the parent owns the
 * plan and decides when to save it.
 */
export function MonthlyPlanPicker({
  plan,
  onChange,
  showProblem = false,
}: {
  plan: AvailabilityPlan;
  onChange: (plan: AvailabilityPlan) => void;
  /** Show what's still missing (after a save attempt). */
  showProblem?: boolean;
}) {
  const custom = plan.windows.filter((w) => !TIME_BLOCKS.some((b) => sameWindow(b.window, w)));
  const [addingCustom, setAddingCustom] = useState(false);
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("12:00");
  const set = (patch: Partial<AvailabilityPlan>) => onChange({ ...plan, ...patch });
  const open = openHoursPerMonth(plan);
  const summary = describePlan(plan);
  const problem = planProblem(plan);

  function toggleDay(day: number) {
    set({ days: plan.days.includes(day) ? plan.days.filter((d) => d !== day) : [...plan.days, day] });
  }
  function toggleWindow(w: PlanWindow) {
    set({
      windows: plan.windows.some((x) => sameWindow(x, w))
        ? plan.windows.filter((x) => !sameWindow(x, w))
        : [...plan.windows, w],
    });
  }
  function addCustom() {
    const w = { start: from, end: to };
    if (to <= from || windowsOverlap([...plan.windows, w])) return;
    set({ windows: [...plan.windows, w] });
    setAddingCustom(false);
  }

  return (
    <div className="mp">
      <section className="mp-part">
        <h3 className="mp-q">How many hours a month can you give?</h3>
        <p className="mp-hint">At least 2. Once this many hours are booked in a month, we stop taking bookings until the next month.</p>
        <div className="mp-row" role="group" aria-label="Hours a month">
          {HOUR_CHOICES.map((h) => (
            <button
              key={h}
              type="button"
              className={plan.hours === h ? "mp-pill on" : "mp-pill"}
              aria-pressed={plan.hours === h}
              onClick={() => set({ hours: h })}
            >
              <span className="num">{h}</span> hrs
            </button>
          ))}
        </div>
      </section>

      <section className="mp-part">
        <h3 className="mp-q">Which days?</h3>
        <div className="mp-switch" role="radiogroup" aria-label="How your days repeat">
          <button
            type="button"
            role="radio"
            aria-checked={plan.mode === "weekly"}
            className={plan.mode === "weekly" ? "on" : ""}
            onClick={() => plan.mode !== "weekly" && set({ mode: "weekly", days: [] })}
          >
            Same weekdays every week
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={plan.mode === "monthly"}
            className={plan.mode === "monthly" ? "on" : ""}
            onClick={() => plan.mode !== "monthly" && set({ mode: "monthly", days: [] })}
          >
            Same dates every month
          </button>
        </div>

        {plan.mode === "weekly" ? (
          <>
            <div className="mp-week" role="group" aria-label="Days of the week">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={plan.days.includes(d.value) ? "mp-day on" : "mp-day"}
                  aria-pressed={plan.days.includes(d.value)}
                  aria-label={d.long}
                  onClick={() => toggleDay(d.value)}
                >
                  {d.short}
                </button>
              ))}
            </div>
            <div className="mp-quick">
              <button type="button" onClick={() => set({ days: [6, 0] })}>
                Weekends
              </button>
              <button type="button" onClick={() => set({ days: [1, 2, 3, 4, 5] })}>
                Weekdays
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mp-dates" role="group" aria-label="Dates of the month">
              {DATES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={plan.days.includes(n) ? "mp-date on" : "mp-date"}
                  aria-pressed={plan.days.includes(n)}
                  onClick={() => toggleDay(n)}
                >
                  <span className="num">{n}</span>
                </button>
              ))}
            </div>
            <p className="mp-hint">Dates 1 to 28, so every month has them.</p>
          </>
        )}
      </section>

      <section className="mp-part">
        <h3 className="mp-q">What time?</h3>
        <p className="mp-hint">Pick one or more. The same times apply to every day you picked.</p>
        <div className="mp-blocks" role="group" aria-label="Times of day">
          {TIME_BLOCKS.map((b) => {
            const on = plan.windows.some((w) => sameWindow(w, b.window));
            return (
              <button
                key={b.key}
                type="button"
                className={on ? "mp-block on" : "mp-block"}
                aria-pressed={on}
                onClick={() => toggleWindow(b.window)}
              >
                <span className="mp-block-name">{b.label}</span>
                <span className="mp-block-time">
                  {timeLabel(b.window.start)}–{timeLabel(b.window.end)}
                </span>
              </button>
            );
          })}
        </div>
        {custom.map((w) => (
          <div key={`${w.start}-${w.end}`} className="mp-custom-row">
            <span>
              {timeLabel(w.start)}–{timeLabel(w.end)}
            </span>
            <button type="button" className="mp-x" aria-label="Remove this time" onClick={() => toggleWindow(w)}>
              <span className="ms" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        ))}
        {addingCustom ? (
          <div className="mp-custom">
            <label>
              <span>From</span>
              <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {timeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>To</span>
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {timeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-ink" onClick={addCustom} disabled={to <= from}>
              Add
            </button>
            {to > from && windowsOverlap([...plan.windows, { start: from, end: to }]) ? (
              <p className="mp-hint mp-err">That overlaps a time you already picked.</p>
            ) : null}
          </div>
        ) : plan.windows.length < 4 ? (
          <button type="button" className="mp-more" onClick={() => setAddingCustom(true)}>
            <span className="ms" aria-hidden="true">
              schedule
            </span>
            Set exact times instead
          </button>
        ) : null}
      </section>

      {summary ? (
        <div className={problem ? "mp-summary warn" : "mp-summary"} aria-live="polite">
          <span className="ms" aria-hidden="true">
            {problem ? "info" : "event_available"}
          </span>
          <div>
            <p className="mp-summary-main">{summary}</p>
            <p className="mp-summary-sub">
              About <strong className="num">{open}</strong> open hours a month
              {plan.hours ? (
                <>
                  {" · "}clients can book up to <strong className="num">{plan.hours}</strong>
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}
      {problem && (showProblem || (summary && plan.hours)) ? (
        <p className="mp-hint mp-err" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
