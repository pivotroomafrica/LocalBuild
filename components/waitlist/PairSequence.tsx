"use client";

import { seqStyle, useScrollSteps } from "./useScrollSteps";

export type Pair = { icon: string; problem: string; problemText: string; fix: string; fixText: string };

/**
 * Problem -> Pivotroom cards that play one after another as you scroll.
 * Wide screens: the row pins while you scroll and the cards play in turn
 * (1, then 2, then 3). Phones (stacked): each plays as it comes into view.
 * In each card the problem appears, the arrow drops, then the answer.
 * Without JavaScript, or with reduced motion, all cards simply show.
 */
export function PairSequence({ pairs }: { pairs: Pair[] }) {
  const { wrap, enabled, shown } = useScrollSteps(pairs.length);

  return (
    <div ref={wrap} className={enabled ? "wl-seq seq-on" : "wl-seq"} style={seqStyle(pairs.length)}>
      <div className="wl-seq-pin">
        <div className="wl-grid3 wl-pairs">
          {pairs.map((item, index) => (
            <div key={item.problem} className={shown[index] ? "wl-pair is-on" : "wl-pair"} data-index={index}>
              <div className="wl-pair-bad">
                <p className="wl-tag wl-tag-bad">
                  <span className="ms" aria-hidden="true">
                    close
                  </span>
                  Today
                </p>
                <h3>{item.problem}</h3>
                <p>{item.problemText}</p>
              </div>
              <div className="wl-pair-good">
                <p className="wl-tag wl-tag-good">
                  <span className="ms" aria-hidden="true">
                    check
                  </span>
                  With Pivotroom
                </p>
                <h3>{item.fix}</h3>
                <p>{item.fixText}</p>
              </div>
            </div>
          ))}
        </div>
        <ol className="wl-seq-dots" aria-hidden="true">
          {pairs.map((item, index) => (
            <li key={item.problem} className={shown[index] ? "on" : ""} />
          ))}
        </ol>
      </div>
    </div>
  );
}
