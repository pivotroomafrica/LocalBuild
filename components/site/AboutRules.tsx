"use client";

import { useState } from "react";

const RULES = [
  {
    icon: "key",
    title: "Access",
    body: "You reach someone you could not have reached alone. No feeds, no endless scrolling.",
    practice: "You can book people you would never get to through a cold message.",
  },
  {
    icon: "videocam",
    title: "Presence",
    body: "One session, one person, full attention. Nothing competes with the conversation.",
    practice: "One-to-one only. No recording unless both of you agree.",
  },
  {
    icon: "verified",
    title: "Standing",
    body: "Our experts' time has real value, and we treat it that way, from vetting to pricing.",
    practice: "Every expert's application is reviewed before they are listed.",
  },
  {
    icon: "receipt_long",
    title: "Plain dealing",
    body: "Price, length and terms are on the page before you book. No surprises afterwards.",
    practice: "VAT and refund terms are shown before you pay, never after.",
  },
];

/** About: "Four rules we don't bend" -- one card highlighted at a time. */
export function AboutRules() {
  const [active, setActive] = useState(1);

  return (
    <section className="rsec" aria-labelledby="rules-title">
      <div className="wrap rhead">
        <h2 id="rules-title" className="h2">
          Four rules
          <br />
          <span style={{ color: "#2b4fe0" }}>we don&apos;t bend</span>
        </h2>
        <p className="muted" style={{ margin: 0, maxWidth: "52ch" }}>
          Every decision on Pivotroom, from the way a profile looks to the way money moves, is tested against these.
        </p>
      </div>
      <div className="rgridwrap">
        <div className="wrap rgrid">
          {RULES.map((rule, index) => (
            <div key={rule.title} className="rcell">
              <button
                type="button"
                className={active === index ? "rcard on" : "rcard"}
                aria-pressed={active === index}
                onClick={() => setActive(index)}
              >
                <span className="rtag">Rule 0{index + 1}</span>
                <span className="d rt">{rule.title}</span>
                <span className="rb">{rule.body}</span>
                <span className="rfoot">
                  <span className="ms" aria-hidden="true" style={{ fontSize: 20 }}>
                    {rule.icon}
                  </span>
                  <span>{rule.practice}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
