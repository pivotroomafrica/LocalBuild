"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { saveGivingAction, type ExpertActionState } from "@/lib/expert/actions";

const initialState: ExpertActionState = {};
const QUICK_PERCENTS = [5, 10, 25, 50];

/**
 * Optional: give a share of session earnings to an NGO. Shows the box
 * clients will see while the expert chooses.
 */
export function GivingForm({
  ngos,
  initialNgoId,
  initialPercent,
  firstName,
}: {
  ngos: { id: string; name: string }[];
  initialNgoId: string | null;
  initialPercent: number | null;
  firstName: string;
}) {
  const [state, formAction, isPending] = useActionState(saveGivingAction, initialState);
  const [ngoId, setNgoId] = useState(initialNgoId ?? "");
  const [percent, setPercent] = useState(initialPercent ?? 10);
  const ngoName = ngos.find((ngo) => ngo.id === ngoId)?.name;

  return (
    <form
      className="oq"
      // Submitted by hand: a plain form action resets the fields to their
      // initial values afterwards, which left the select out of step with
      // the choice shown in the preview.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <div className="oq-head">
        <span className="oq-n ms gold-mark" aria-hidden="true" style={{ fontSize: 22 }}>
          verified
        </span>
        <label htmlFor="ngo_id" className="oq-label">
          Give part of your earnings to a cause (optional)
        </label>
      </div>
      <p className="oq-hint">
        Choose an Ethiopian NGO and the share of your session earnings you will give. Your profile shows it to clients
        and your verified mark turns gold.
      </p>

      <select id="ngo_id" name="ngo_id" className="input" value={ngoId} onChange={(e) => setNgoId(e.target.value)}>
        <option value="">I don&apos;t want to add one</option>
        {ngos.map((ngo) => (
          <option key={ngo.id} value={ngo.id}>
            {ngo.name}
          </option>
        ))}
      </select>

      {ngoId ? (
        <>
          <div className="giving-pct">
            <label htmlFor="donation_percent" className="label">
              Share of your earnings
            </label>
            <div className="giving-pct-row">
              <input
                id="donation_percent"
                name="donation_percent"
                type="range"
                min={1}
                max={100}
                step={1}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
              />
              <span className="giving-pct-value num">{percent}%</span>
            </div>
            <div className="oq-ticks" role="group" aria-label="Quick choices">
              {QUICK_PERCENTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === percent ? "chip on" : "chip"}
                  onClick={() => setPercent(value)}
                >
                  {value}%
                </button>
              ))}
            </div>
          </div>

          <div className="giving-box" aria-live="polite">
            <span className="giving-icon" aria-hidden="true">
              <span className="ms">volunteer_activism</span>
            </span>
            <p>
              <strong className="num">{percent}%</strong> of {firstName || "your"}&apos;s earnings from Pivotroom
              sessions go to <strong>{ngoName}</strong>
            </p>
          </div>
        </>
      ) : null}

      <p className="oq-hint" style={{ margin: 0 }}>
        Organisation not listed? <Link href="/contact">Send us its name</Link> and we&apos;ll add it.
      </p>

      {state.error ? (
        <p className="notice err" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success && !isPending ? (
        <p className="notice" role="status">
          {ngoId ? "Saved. Your profile shows it once it is live." : "Saved. No organisation is shown on your profile."}
        </p>
      ) : null}
      <div className="oq-actions">
        <button type="submit" className="btn btn-ink md" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
