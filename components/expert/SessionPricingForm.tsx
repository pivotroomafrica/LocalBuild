"use client";

import { useActionState, useState } from "react";
import { saveSessionPricingAction, type ExpertActionState } from "@/lib/expert/actions";
import { calculateAllDurationPrices } from "@/lib/expert/pricing";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { SESSION_DURATIONS, type SessionDuration } from "@/types/expert";

const initialState: ExpertActionState = {};

type Props = {
  initialBasePrice: number | null;
  initialDurations: SessionDuration[];
  initialOnlineEnabled: boolean;
  initialInPersonEnabled: boolean;
};

export function SessionPricingForm({
  initialBasePrice,
  initialDurations,
  initialOnlineEnabled,
  initialInPersonEnabled,
}: Props) {
  const [basePriceInput, setBasePriceInput] = useState(
    initialBasePrice != null ? String(initialBasePrice) : "",
  );
  const [enabledDurations, setEnabledDurations] = useState<Set<SessionDuration>>(
    new Set(initialDurations),
  );
  const [onlineEnabled, setOnlineEnabled] = useState(initialOnlineEnabled);
  const [inPersonEnabled, setInPersonEnabled] = useState(initialInPersonEnabled);

  const [state, formAction, isPending] = useActionState(saveSessionPricingAction, initialState);

  const parsedBasePrice = Number(basePriceInput);
  const hasValidBasePrice = basePriceInput.trim() !== "" && !Number.isNaN(parsedBasePrice) && parsedBasePrice > 0;
  const previewPrices = calculateAllDurationPrices(hasValidBasePrice ? parsedBasePrice : 0);

  function toggleDuration(duration: SessionDuration) {
    setEnabledDurations((prev) => {
      const next = new Set(prev);
      if (next.has(duration)) {
        next.delete(duration);
      } else {
        next.add(duration);
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <section className="flex flex-col gap-2">
        <label htmlFor="base_hourly_price" className="text-sm font-medium text-[var(--color-text)]">
          60-minute session price
        </label>
        <div className="flex items-center gap-2">
          <input
            id="base_hourly_price"
            name="base_hourly_price"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="50000"
            value={basePriceInput}
            onChange={(event) => setBasePriceInput(event.target.value)}
            required
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base text-[var(--color-text)]"
          />
          <span className="text-sm font-medium text-[var(--color-text-muted)]">ETB</span>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Pivotroom uses this rate to automatically calculate your other session prices.
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Your session price is the base price. Applicable government taxes will be
          calculated separately.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Available session lengths</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Choose the session lengths customers can book with you.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {SESSION_DURATIONS.map((duration) => (
            <label
              key={duration}
              className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                name="durations"
                value={duration}
                checked={enabledDurations.has(duration)}
                onChange={() => toggleDuration(duration)}
                className="h-4 w-4"
              />
              {duration} minutes
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          How can customers meet with you?
        </h2>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="online_enabled"
              checked={onlineEnabled}
              onChange={(event) => setOnlineEnabled(event.target.checked)}
              className="h-4 w-4"
            />
            Online
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="in_person_enabled"
              checked={inPersonEnabled}
              onChange={(event) => setInPersonEnabled(event.target.checked)}
              className="h-4 w-4"
            />
            In Person
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Your session prices</h2>
        <ul className="flex flex-col gap-1.5">
          {SESSION_DURATIONS.map((duration) => {
            const isEnabled = enabledDurations.has(duration);
            return (
              <li
                key={duration}
                className={`flex items-center justify-between text-sm ${
                  isEnabled ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
                }`}
              >
                <span>{duration} min</span>
                <span className={isEnabled ? "font-medium" : ""}>
                  {hasValidBasePrice ? previewPrices[duration].toLocaleString() : "—"} ETB
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-[var(--color-text-muted)]">
          Prices are automatically calculated from your 60-minute rate.
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Displayed prices are base session prices. Applicable government taxes will be
          calculated separately.
        </p>
      </section>

      <Button type="submit" isLoading={isPending} loadingText="Saving...">
        Save &amp; Review
      </Button>
    </form>
  );
}
