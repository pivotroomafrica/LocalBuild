"use client";

import { useState, useTransition } from "react";
import { MonthlyPlanPicker } from "@/components/expert/MonthlyPlanPicker";
import { saveAvailabilityPlanAction } from "@/lib/availability/planActions";
import { describePlan, planProblem, type AvailabilityPlan } from "@/lib/availability/plan";

/** "Your monthly plan" on the Availability page: the same picker as
 * onboarding, with a save button and how much of this month is booked. */
export function MonthlyPlanSection({
  initialPlan,
  bookedMinutesThisMonth,
}: {
  initialPlan: AvailabilityPlan;
  bookedMinutesThisMonth: number;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [saved, setSaved] = useState(initialPlan);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [tried, setTried] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved);
  const bookedHours = Math.round((bookedMinutesThisMonth / 60) * 10) / 10;
  const cap = saved.hours;

  function save() {
    setTried(true);
    if (planProblem(plan)) return;
    startTransition(async () => {
      const result = await saveAvailabilityPlanAction(plan);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setSaved(plan);
      setJustSaved(true);
    });
  }

  return (
    <section className="panel stack" style={{ gap: 18 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="ws-h2">Your monthly plan</h2>
        <p className="muted" style={{ margin: 0 }}>
          {saved.days.length && saved.windows.length
            ? saved.hours
              ? `${describePlan(saved)}. Up to ${saved.hours} hours of bookings a month.`
              : `${describePlan(saved)}. Choose how many hours a month you give Pivotroom (at least 2), then save.`
            : "Choose how many hours a month you give Pivotroom, and when."}
        </p>
      </div>

      {cap ? (
        <div className="mp-meter" aria-label={`Booked this month: ${bookedHours} of ${cap} hours`}>
          <div className="mp-meter-top">
            <span>Booked this month</span>
            <strong className="num">
              {bookedHours} of {cap} hrs
            </strong>
          </div>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (bookedHours / cap) * 100)}%` }} />
          </div>
          {bookedHours >= cap ? (
            <p className="mp-hint">This month is fully booked. New bookings open again next month.</p>
          ) : null}
        </div>
      ) : null}

      <MonthlyPlanPicker
        plan={plan}
        onChange={(next) => {
          setPlan(next);
          setJustSaved(false);
        }}
        showProblem={tried}
      />

      {error ? (
        <p className="notice err" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className="oq-actions">
        <button type="button" className="btn btn-ink md" onClick={save} disabled={isPending || (!dirty && !error)}>
          {isPending ? "Saving…" : "Save my plan"}
        </button>
        {justSaved && !dirty ? (
          <span className="muted" role="status">
            Saved. Clients can now book these times.
          </span>
        ) : dirty ? (
          <span className="muted">This replaces your current regular days and times. Specific dates stay.</span>
        ) : null}
      </div>
    </section>
  );
}
