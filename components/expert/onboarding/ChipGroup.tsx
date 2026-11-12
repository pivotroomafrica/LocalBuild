"use client";

import { useState } from "react";

/**
 * Tap-to-select answers, with an optional "Write my own" that adds the typed
 * answer as a selected option. Shows shimmering placeholders while
 * suggestions load.
 *
 * "tiles" (default): an even grid of answer cards with a tick that is always
 * there and just fills in, so tapping never changes a card's size and
 * nothing jumps around. "pills": short values (years, languages) in a row.
 */
export function ChipGroup({
  label,
  options,
  selected,
  onChange,
  max = 1,
  loading = false,
  allowCustom = true,
  customPlaceholder = "Type your own answer",
  customMaxLength = 80,
  layout = "tiles",
  icons,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** 1 = single choice (tapping replaces). */
  max?: number;
  loading?: boolean;
  allowCustom?: boolean;
  customPlaceholder?: string;
  customMaxLength?: number;
  layout?: "tiles" | "pills";
  /** Optional Material Symbols icon per option. */
  icons?: Record<string, string>;
}) {
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const lower = selected.map((s) => s.toLowerCase());
  // Keep the expert's own answers visible even if new suggestions arrive.
  const shown = [...options, ...selected.filter((s) => !options.some((o) => o.toLowerCase() === s.toLowerCase()))];
  const full = max > 1 && selected.length >= max;
  const waiting = loading && options.length === 0;
  const tiles = layout === "tiles";

  function toggle(option: string) {
    const on = lower.includes(option.toLowerCase());
    if (max === 1) return onChange(on ? [] : [option]);
    if (on) return onChange(selected.filter((s) => s.toLowerCase() !== option.toLowerCase()));
    if (!full) onChange([...selected, option]);
  }

  function addCustom() {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value) return setWriting(false);
    if (!lower.includes(value.toLowerCase())) {
      onChange(max === 1 ? [value] : full ? selected : [...selected, value]);
    }
    setDraft("");
    setWriting(false);
  }

  return (
    <div className="ob-chips-wrap">
      <div
        className={tiles ? "ob-tiles" : "ob-chips"}
        role="group"
        aria-label={label}
        aria-busy={loading || undefined}
      >
        {/* While suggestions load, keep the expert's own picks on screen. */}
        {(waiting ? selected : shown).map((option) => {
          const on = lower.includes(option.toLowerCase());
          return (
            <button
              key={option}
              type="button"
              className={`${tiles ? "ob-tile" : "ob-chip"}${on ? " on" : ""}`}
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => toggle(option)}
            >
              {tiles ? (
                <span className={max === 1 ? "ob-tick round" : "ob-tick"} aria-hidden="true">
                  <span className="ms">check</span>
                </span>
              ) : null}
              {icons?.[option] ? (
                <span className="ms ob-tile-icon" aria-hidden="true">
                  {icons[option]}
                </span>
              ) : null}
              <span className="ob-tile-text">{option}</span>
            </button>
          );
        })}
        {waiting
          ? Array.from({ length: Math.max(3, 6 - selected.length) }, (_, i) => (
              <span key={`skel-${i}`} className={`${tiles ? "ob-tile" : "ob-chip"} ob-chip-skel`} aria-hidden="true" />
            ))
          : null}
        {allowCustom && !writing ? (
          <button
            type="button"
            className={`${tiles ? "ob-tile" : "ob-chip"} ob-chip-add`}
            onClick={() => setWriting(true)}
            disabled={full}
          >
            <span className="ms" aria-hidden="true">
              add
            </span>
            Write my own
          </button>
        ) : null}
      </div>
      {writing ? (
        <div className="ob-custom">
          <input
            className="input"
            autoFocus
            value={draft}
            maxLength={customMaxLength}
            placeholder={customPlaceholder}
            aria-label={customPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
              if (e.key === "Escape") setWriting(false);
            }}
          />
          <button type="button" className="btn btn-ink" onClick={addCustom}>
            Add
          </button>
        </div>
      ) : null}
      {max > 1 ? (
        <p className="ob-hint" aria-live="polite">
          {selected.length === 0 ? `Pick up to ${max}` : `${selected.length} of ${max} picked`}
        </p>
      ) : null}
    </div>
  );
}
