"use client";

import { useEffect, useState } from "react";
import { seqStyle, useScrollSteps } from "./useScrollSteps";

export type HowStep = { title: string; text: string };

/** What the visitor "types" in the step 1 demo. */
const EXAMPLE_PROBLEM =
  "We want to export our coffee to the Gulf, but we don't know which licences we need or how to find a first buyer.";

/**
 * How it works, played step by step as you scroll:
 * 1. the problem is written out word by word,
 * 2. the AI looks for a match and an expert card appears,
 * 3. the session is booked.
 * The demos are illustrations (no real person is shown).
 */
export function HowSequence({ steps }: { steps: HowStep[] }) {
  const { wrap, enabled, shown } = useScrollSteps(steps.length);
  const words = EXAMPLE_PROBLEM.split(" ");
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (!shown[0]) return;
    const timer = window.setInterval(() => {
      setTyped((n) => {
        if (n >= words.length) {
          window.clearInterval(timer);
          return n;
        }
        return n + 1;
      });
    }, 110);
    return () => window.clearInterval(timer);
  }, [shown, words.length]);

  const visible = enabled ? typed : words.length;
  const done = visible >= words.length;

  return (
    <div ref={wrap} className={enabled ? "wl-seq wl-seq-how seq-on" : "wl-seq wl-seq-how"} style={seqStyle(steps.length)}>
      <div className="wl-seq-pin">
        <div className="wl-grid3 wl-steps wl-how">
          {steps.map((step, index) => (
            <div key={step.title} className={shown[index] ? "wl-card wl-how-card is-on" : "wl-card wl-how-card"} data-index={index}>
              <span className="wl-how-num">Step {index + 1}</span>
              <div className="wl-demo" aria-hidden="true">
                {index === 0 && (
                  <div className="wl-demo-type">
                    <span className="wl-demo-label">Your problem</span>
                    <p>
                      {words.slice(0, visible).join(" ")}
                      <span className={done ? "wl-caret done" : "wl-caret"} />
                    </p>
                  </div>
                )}
                {index === 1 && (
                  <div className="wl-demo-match">
                    <div className="wl-demo-scan">
                      <span className="ms">auto_awesome</span>
                      Finding your expert…
                    </div>
                    <div className="wl-demo-expert">
                      <span className="wl-demo-avatar ms">person</span>
                      <div>
                        <strong>Your matched expert</strong>
                        <span className="wl-demo-chips">
                          <span>Export licensing</span>
                          <span>Gulf buyers</span>
                        </span>
                      </div>
                      <span className="wl-demo-badge">
                        <span className="ms">bolt</span>
                        Matched
                      </span>
                    </div>
                  </div>
                )}
                {index === 2 && (
                  <div className="wl-demo-book">
                    <span className="wl-demo-slot">
                      <span className="ms">event</span>
                      Pick a time
                    </span>
                    <span className="wl-demo-btn">
                      <span className="wl-demo-btn-idle">Book session</span>
                      <span className="wl-demo-btn-done">
                        <span className="ms">check</span>
                        Booked
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
        <ol className="wl-seq-dots" aria-hidden="true">
          {steps.map((step, i) => (
            <li key={step.title} className={shown[i] ? "on" : ""} />
          ))}
        </ol>
      </div>
    </div>
  );
}
