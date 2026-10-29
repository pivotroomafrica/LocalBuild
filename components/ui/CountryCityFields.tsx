"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COUNTRIES, type Country } from "@/lib/geo/countries";

const PINNED = ["ET"];
const cityCache = new Map<string, string[]>();

function Flag({ code }: { code: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG flag
    <img className="cc-flag" src={`/flags/${code.toLowerCase()}.svg`} alt="" width={24} height={18} loading="lazy" />
  );
}

function findCountry(name: string | null | undefined): Country | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  return COUNTRIES.find((c) => c.name.toLowerCase() === key || c.code.toLowerCase() === key);
}

/**
 * Country (searchable list with flags) and city (suggestions for the chosen
 * country, any value allowed). Posts the country NAME as `country` and the
 * city as `city`, the same text columns as before.
 */
export function CountryCityFields({
  defaultCountry,
  defaultCity,
  required = false,
  countryLabel = "Country",
  cityLabel = "City",
}: {
  defaultCountry?: string | null;
  defaultCity?: string | null;
  required?: boolean;
  countryLabel?: string;
  cityLabel?: string;
}) {
  const id = useId();
  const [country, setCountry] = useState<Country | undefined>(() => findCountry(defaultCountry) ?? findCountry("ET"));
  const [city, setCity] = useState(defaultCity ?? "");
  const [, setLoadedCode] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const cityCode = country?.hasCities ? country.code : null;
  const cities = (cityCode && cityCache.get(cityCode)) || [];

  useEffect(() => {
    if (!cityCode || cityCache.has(cityCode)) return;
    let cancelled = false;
    fetch(`/geo/cities/${cityCode}.json`)
      .then((response) => (response.ok ? response.json() : []))
      .then((list: string[]) => {
        cityCache.set(cityCode, list);
        // Re-render so the new suggestions show.
        if (!cancelled) setLoadedCode(cityCode);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cityCode]);

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
    const q = query.trim().toLowerCase();
    const matches = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
    if (q) return matches;
    const pinned = PINNED.map((code) => matches.find((c) => c.code === code)).filter((c): c is Country => Boolean(c));
    return [...pinned, ...matches.filter((c) => !PINNED.includes(c.code))];
  }, [query]);

  function pick(next: Country) {
    if (next.code !== country?.code) setCity("");
    setCountry(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="cc">
      <div className="field">
        <span className="label" id={`${id}-country-label`}>
          {countryLabel}
        </span>
        <div className="cc-box" ref={boxRef}>
          <button
            type="button"
            className="input cc-button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-labelledby={`${id}-country-label`}
            onClick={() => setOpen((value) => !value)}
          >
            {country ? <Flag code={country.code} /> : null}
            <span className="cc-name">{country?.name ?? "Choose a country"}</span>
            <span className="ms" aria-hidden="true">
              expand_more
            </span>
          </button>
          <input type="hidden" name="country" value={country?.name ?? ""} />
          {open ? (
            <div className="cc-pop">
              <input
                ref={searchRef}
                className="input cc-search"
                type="search"
                placeholder="Search countries"
                aria-label="Search countries"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <ul className="cc-list" role="listbox" aria-label={countryLabel}>
                {list.map((c) => (
                  <li key={c.code} role="option" aria-selected={c.code === country?.code}>
                    <button type="button" className={c.code === country?.code ? "cc-opt on" : "cc-opt"} onClick={() => pick(c)}>
                      <Flag code={c.code} />
                      <span>{c.name}</span>
                    </button>
                  </li>
                ))}
                {list.length === 0 ? <li className="cc-none">No country matches “{query}”</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor={`${id}-city`}>
          {cityLabel}
        </label>
        <input
          id={`${id}-city`}
          className="input"
          name="city"
          list={`${id}-cities`}
          autoComplete="off"
          required={required}
          maxLength={100}
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder={cities.length > 0 ? `Start typing, e.g. ${cities[0]}` : "Your city or town"}
        />
        <datalist id={`${id}-cities`}>
          {cities.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
