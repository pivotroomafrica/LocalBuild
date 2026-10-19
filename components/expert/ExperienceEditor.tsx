"use client";

import { useState } from "react";

type Row = { start_year: string; end_year: string; title: string; organization: string };

const EMPTY_ROW: Row = { start_year: "", end_year: "", title: "", organization: "" };
const MAX_ROWS = 12;

function toRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      start_year: row.start_year == null ? "" : String(row.start_year),
      end_year: row.end_year == null ? "" : String(row.end_year),
      title: String(row.title ?? ""),
      organization: String(row.organization ?? ""),
    };
  });
}

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-mist)] bg-[var(--color-mist)] px-3 py-2.5 text-base text-[var(--color-text)] focus-visible:bg-[var(--color-surface)] focus-visible:outline-none";

/** Dated experience timeline ("2016 – now · Founder · Company"), shown on
 * the public profile. Submitted as one JSON field and validated on the
 * server (lib/expert/profileDetails.ts). */
export function ExperienceEditor({ initial }: { initial: unknown }) {
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = toRows(initial);
    return existing.length > 0 ? existing : [{ ...EMPTY_ROW }];
  });

  function update(index: number, key: keyof Row, value: string) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="experience" value={JSON.stringify(rows)} />
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-medium text-[var(--color-text)]">Experience</span>
        <span className="text-sm text-[var(--color-text-muted)]">
          Optional. Your main roles, newest first. Leave the end year empty for a role you still hold.
        </span>
      </div>
      {rows.map((row, index) => (
        <fieldset key={index} className="grid grid-cols-2 gap-2 rounded-[var(--radius-input)] border border-[var(--color-border)] p-3 sm:grid-cols-[90px_90px_1fr_1fr_auto]">
          <legend className="sr-only">Experience entry {index + 1}</legend>
          <input
            aria-label="Start year"
            inputMode="numeric"
            placeholder="From"
            maxLength={4}
            className={inputClass}
            value={row.start_year}
            onChange={(event) => update(index, "start_year", event.target.value)}
          />
          <input
            aria-label="End year (empty for now)"
            inputMode="numeric"
            placeholder="To / now"
            maxLength={4}
            className={inputClass}
            value={row.end_year}
            onChange={(event) => update(index, "end_year", event.target.value)}
          />
          <input
            aria-label="Role or title"
            placeholder="Role, e.g. Founder"
            maxLength={100}
            className={`${inputClass} col-span-2 sm:col-span-1`}
            value={row.title}
            onChange={(event) => update(index, "title", event.target.value)}
          />
          <input
            aria-label="Organisation"
            placeholder="Organisation, city"
            maxLength={120}
            className={`${inputClass} col-span-2 sm:col-span-1`}
            value={row.organization}
            onChange={(event) => update(index, "organization", event.target.value)}
          />
          <button
            type="button"
            onClick={() => setRows((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : [{ ...EMPTY_ROW }]))}
            className="col-span-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-danger)] sm:col-span-1"
          >
            Remove
          </button>
        </fieldset>
      ))}
      {rows.length < MAX_ROWS ? (
        <button
          type="button"
          onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
          className="w-fit text-sm font-medium text-[var(--color-accent)] hover:underline"
        >
          + Add a role
        </button>
      ) : null}
    </div>
  );
}
