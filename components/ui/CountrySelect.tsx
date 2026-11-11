"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, type Country } from "@/lib/geo/countries";

const PINNED = ["ET"];

export function Flag({ code }: { code: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG flag
    <img className="cc-flag" src={`/flags/${code.toLowerCase()}.svg`} alt="" width={24} height={18} loading="lazy" />
  );
}

export function findCountry(name: string | null | undefined): Country | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  return COUNTRIES.find((c) => c.name.toLowerCase() === key || c.code.toLowerCase() === key);
}

/**
 * Button showing the chosen country, opening a searchable list with flags
 * (Ethiopia pinned first). `showDial` adds each country's calling code.
 */
export function CountrySelect({
  value,
  onChange,
  labelledBy,
  listLabel,
  showDial = false,
  compact = false,
}: {
  value: Country | undefined;
  onChange: (country: Country) => void;
  labelledBy?: string;
  listLabel: string;
  showDial?: boolean;
  /** Only the flag and code on the button (phone field). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onPointer(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    const pool = showDial ? COUNTRIES.filter((c) => c.dial) : COUNTRIES;
    const matches = pool.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase() === q ||
        (showDial && c.dial.slice(1).startsWith(q)),
    );
    if (q) return matches;
    const pinned = PINNED.map((code) => matches.find((c) => c.code === code)).filter((c): c is Country => Boolean(c));
    return [...pinned, ...matches.filter((c) => !PINNED.includes(c.code))];
  }, [query, showDial]);

  function pick(next: Country) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={compact ? "cc-box cc-compact" : "cc-box"} ref={boxRef}>
      <button
        type="button"
        className="input cc-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : `${listLabel}: ${value?.name ?? "none"}`}
        onClick={() => setOpen((v) => !v)}
      >
        {value ? <Flag code={value.code} /> : null}
        <span className="cc-name">
          {compact ? (value?.dial ?? "+") : (value?.name ?? "Choose a country")}
        </span>
        <span className="ms" aria-hidden="true">
          expand_more
        </span>
      </button>
      {open ? (
        <div className="cc-pop">
          <input
            ref={searchRef}
            className="input cc-search"
            type="search"
            placeholder={showDial ? "Search country or code" : "Search countries"}
            aria-label={showDial ? "Search country or code" : "Search countries"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="cc-list" role="listbox" aria-label={listLabel}>
            {list.map((c) => (
              <li key={c.code} role="option" aria-selected={c.code === value?.code}>
                <button type="button" className={c.code === value?.code ? "cc-opt on" : "cc-opt"} onClick={() => pick(c)}>
                  <Flag code={c.code} />
                  <span>{c.name}</span>
                  {showDial ? <span className="cc-dial num">{c.dial}</span> : null}
                </button>
              </li>
            ))}
            {list.length === 0 ? <li className="cc-none">No country matches “{query}”</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
