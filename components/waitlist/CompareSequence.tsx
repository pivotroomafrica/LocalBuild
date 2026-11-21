"use client";

import { seqStyle, useScrollSteps } from "./useScrollSteps";

type Path = { label: string; steps: string[]; foot: string };

/**
 * "Without Pivotroom" vs "With Pivotroom", played in turn as you scroll:
 * first the slow path lists its steps and its bar crawls all the way
 * across, then the Pivotroom path lists its steps and its bar fills a
 * short way, fast.
 */
export function CompareSequence({ slow, fast }: { slow: Path; fast: Path }) {
  const { wrap, enabled, shown } = useScrollSteps(2);
  const cls = (base: string, index: number) => `${base}${shown[index] ? " is-on" : ""}`;

  return (
    <div ref={wrap} className={enabled ? "wl-seq wl-seq-compare seq-on" : "wl-seq wl-seq-compare"} style={seqStyle(2)}>
      <div className="wl-seq-pin">
        <div className="wl-compare">
          <div className={cls("wl-path wl-path-slow", 0)} data-index={0}>
            <p className="wl-tag wl-tag-bad">
              <span className="ms" aria-hidden="true">
                close
              </span>
              Without Pivotroom
            </p>
            <p className="wl-path-label">{slow.label}</p>
            <ol>
              {slow.steps.map((step, i) => (
                <li key={step} style={{ "--i": i } as React.CSSProperties}>
                  {step}
                </li>
              ))}
            </ol>
            <div className="wl-bar">
              <span className="wl-bar-fill slow" />
            </div>
            <p className="wl-path-foot">{slow.foot}</p>
          </div>
          <div className={cls("wl-path wl-path-fast", 1)} data-index={1}>
            <p className="wl-tag wl-tag-good">
              <span className="ms" aria-hidden="true">
                check
              </span>
              With Pivotroom
            </p>
            <p className="wl-path-label">{fast.label}</p>
            <ol>
              {fast.steps.map((step, i) => (
                <li key={step} style={{ "--i": i } as React.CSSProperties}>
                  {step}
                </li>
              ))}
            </ol>
            <div className="wl-bar">
              <span className="wl-bar-fill fast" />
            </div>
            <p className="wl-path-foot">{fast.foot}</p>
          </div>
        </div>
        <ol className="wl-seq-dots" aria-hidden="true">
          {[0, 1].map((i) => (
            <li key={i} className={shown[i] ? "on" : ""} />
          ))}
        </ol>
      </div>
    </div>
  );
}
