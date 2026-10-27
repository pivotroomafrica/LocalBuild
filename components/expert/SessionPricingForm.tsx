"use client";

import { useActionState, useState } from "react";
import { saveSessionPricingAction, type ExpertActionState } from "@/lib/expert/actions";
import { calculateAllDurationPrices } from "@/lib/expert/pricing";
import { RESPONSE_TIME_OPTIONS } from "@/lib/expert/profileDetails";
import { SESSION_DURATIONS, type SessionDuration } from "@/types/expert";
import { customerPrice, expertPayout, formatVatRate, type PlatformPricing } from "@/lib/pricing/platform";

const initialState: ExpertActionState = {};

type Props = {
  initialBasePrice: number | null;
  initialDurations: SessionDuration[];
  initialOnlineEnabled: boolean;
  initialInPersonEnabled: boolean;
  initialResponseTime: string | null;
  pricing: PlatformPricing;
};

/** Onboarding step 3, "Sessions and hours" (questions 15-17). */
export function SessionPricingForm({
  initialBasePrice,
  initialDurations,
  initialOnlineEnabled,
  initialInPersonEnabled,
  initialResponseTime,
  pricing,
}: Props) {
  const [basePriceInput, setBasePriceInput] = useState(initialBasePrice != null ? String(initialBasePrice) : "");
  const [enabledDurations, setEnabledDurations] = useState<Set<SessionDuration>>(new Set(initialDurations));

  const [state, formAction, isPending] = useActionState(saveSessionPricingAction, initialState);

  const parsedBasePrice = Number(basePriceInput);
  const hasValidBasePrice = basePriceInput.trim() !== "" && !Number.isNaN(parsedBasePrice) && parsedBasePrice > 0;
  const previewPrices = calculateAllDurationPrices(hasValidBasePrice ? parsedBasePrice : 0);

  function toggleDuration(duration: SessionDuration) {
    setEnabledDurations((prev) => {
      const next = new Set(prev);
      if (next.has(duration)) next.delete(duration);
      else next.add(duration);
      return next;
    });
  }

  return (
    <form action={formAction} className="oq-form">
      {state.error ? <p className="notice err" role="alert">{state.error}</p> : null}

      <div className="oq">
        <div className="oq-head">
          <span className="oq-n num" aria-hidden="true">
            16
          </span>
          <label htmlFor="base_hourly_price" className="oq-label">
            What do you charge for 60 minutes?<span className="oq-req"> · required</span>
          </label>
        </div>
        <p className="oq-hint">
          In ETB, before VAT. Clients pay this plus {formatVatRate(pricing.vatRate)} VAT. Pivotroom&apos;s{" "}
          {formatVatRate(pricing.commissionRate)} is included in it, so you receive the rest.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            id="base_hourly_price"
            name="base_hourly_price"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="2500"
            value={basePriceInput}
            onChange={(event) => setBasePriceInput(event.target.value)}
            required
            className="input num"
          />
          <span className="muted">ETB</span>
        </div>
      </div>

      <div className="oq">
        <div className="oq-head">
          <span className="oq-n num" aria-hidden="true">
            17
          </span>
          <span className="oq-label">
            Which session lengths and formats do you offer?<span className="oq-req"> · required</span>
          </span>
        </div>
        <p className="oq-hint">Other lengths are priced from your 60-minute rate automatically.</p>
        <div className="oq-ticks" role="group" aria-label="Session lengths">
          {SESSION_DURATIONS.map((duration) => (
            <label key={duration} className="oq-tick">
              <input
                type="checkbox"
                name="durations"
                value={duration}
                checked={enabledDurations.has(duration)}
                onChange={() => toggleDuration(duration)}
              />
              {duration} minutes
            </label>
          ))}
        </div>
        <div className="oq-ticks" role="group" aria-label="Session formats">
          <label className="oq-tick">
            <input type="checkbox" name="online_enabled" defaultChecked={initialOnlineEnabled} />
            Online (Google Meet)
          </label>
          <label className="oq-tick">
            <input type="checkbox" name="in_person_enabled" defaultChecked={initialInPersonEnabled} />
            In person
          </label>
        </div>

        <div className="rows" style={{ marginBlockStart: 8 }}>
          {SESSION_DURATIONS.filter((duration) => enabledDurations.has(duration)).map((duration) => (
            <div key={duration} style={{ gridTemplateColumns: "110px minmax(0, 1fr)" }}>
              <span className="num">{duration} min</span>
              <span className="num" style={{ textAlign: "right" }}>
                {hasValidBasePrice ? (
                  <>
                    <strong>{previewPrices[duration].toLocaleString()} ETB</strong>
                    <span className="muted" style={{ display: "block", fontSize: 13 }}>
                      Client pays {customerPrice(previewPrices[duration], pricing.vatRate).toLocaleString()} · you
                      receive {expertPayout(previewPrices[duration], pricing.commissionRate).toLocaleString()}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="oq">
        <div className="oq-head">
          <span className="oq-n num" aria-hidden="true">
            18
          </span>
          <label htmlFor="response_time" className="oq-label">
            How quickly do you usually reply to clients?
          </label>
        </div>
        <p className="oq-hint">Shown on your profile, so pick what you can keep to.</p>
        <select id="response_time" name="response_time" className="input" defaultValue={initialResponseTime ?? ""}>
          <option value="">Prefer not to say</option>
          {RESPONSE_TIME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="oq-actions">
        <button type="submit" className="btn btn-ink md" disabled={isPending}>
          {isPending ? "Saving…" : "Save and review"}
        </button>
      </div>
    </form>
  );
}
