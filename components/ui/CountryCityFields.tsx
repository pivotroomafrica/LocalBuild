"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Country } from "@/lib/geo/countries";
import { CountrySelect, findCountry } from "@/components/ui/CountrySelect";

const cityCache = new Map<string, string[]>();

/**
 * Country (searchable list with flags) and city, which must be picked from
 * the chosen country's list (typing filters it; a name typed out in full is
 * matched to the list). The city suggestions are our own dropdown, not
 * a <datalist>, which many phone browsers don't show. Posts the country NAME as `country` and the
 * city as `city`, the same text columns as before.
 */
export function CountryCityFields({
  defaultCountry,
  defaultCity,
  required = false,
  countryLabel = "Country",
  cityLabel = "City",
  onCityChange,
}: {
  defaultCountry?: string | null;
  defaultCity?: string | null;
  required?: boolean;
  countryLabel?: string;
  cityLabel?: string;
  /** Called with the city text and whether it counts (picked from the list,
   * or any text for a country without a list). */
  onCityChange?: (city: string, valid: boolean) => void;
}) {
  const id = useId();
  const [country, setCountry] = useState<Country | undefined>(() => findCountry(defaultCountry) ?? findCountry("ET"));
  const [city, setCity] = useState(defaultCity ?? "");
  const [, setLoadedCode] = useState("");

  const cityCode = country?.hasCities ? country.code : null;
  const cities = (cityCode && cityCache.get(cityCode)) || [];
  // Once the country's list is loaded, only a city from it counts.
  const listReady = Boolean(cityCode && cityCache.has(cityCode) && cities.length > 0);
  const listed = (name: string) => {
    const key = name.trim().toLowerCase();
    return key ? cities.find((c) => c.toLowerCase() === key) : undefined;
  };
  const typed = city.trim();
  const cityValid = !listReady || !typed || Boolean(listed(typed));
  const [touched, setTouched] = useState(false);
  const cityInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cityInput.current?.setCustomValidity(cityValid ? "" : "Please choose your city from the list.");
  }, [cityValid]);

  const report = useRef(onCityChange);
  useEffect(() => {
    report.current = onCityChange;
  });
  useEffect(() => {
    report.current?.(typed, cityValid);
  }, [typed, cityValid]);

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

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Best matches first: names that start with what was typed, then names
  // that contain it. With nothing typed, the largest cities.
  const matches = (() => {
    const query = city.trim().toLowerCase();
    if (!query) return cities.slice(0, 8);
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of cities) {
      const lower = name.toLowerCase();
      if (lower === query) continue;
      if (lower.startsWith(query)) starts.push(name);
      else if (lower.includes(query)) contains.push(name);
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  })();

  const showList = open && (matches.length > 0 || (listReady && typed.length > 0 && !cityValid));

  function choose(name: string) {
    setCity(name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, -1));
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function pick(next: Country) {
    if (next.code !== country?.code) setCity("");
    setCountry(next);
  }

  return (
    <div className="cc">
      <div className="field">
        <span className="label" id={`${id}-country-label`}>
          {countryLabel}
        </span>
        <CountrySelect
          value={country}
          onChange={pick}
          labelledBy={`${id}-country-label`}
          listLabel={countryLabel}
        />
        <input type="hidden" name="country" value={country?.name ?? ""} />
      </div>

      <div className="field">
        <label className="label" htmlFor={`${id}-city`}>
          {cityLabel}
        </label>
        <div className="cc-box">
          <input
            ref={cityInput}
            id={`${id}-city`}
            className="input"
            name="city"
            role="combobox"
            aria-expanded={showList}
            aria-controls={`${id}-cities`}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${id}-city-${active}` : undefined}
            autoComplete="off"
            required={required}
            maxLength={100}
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setTouched(true);
              // A name typed out in full takes the list's spelling.
              const exact = listed(city);
              if (exact && exact !== city) setCity(exact);
            }}
            aria-invalid={touched && !cityValid ? true : undefined}
            aria-describedby={touched && !cityValid ? `${id}-city-err` : undefined}
            onKeyDown={onKeyDown}
            placeholder={cities.length > 0 ? `Start typing, then pick, e.g. ${cities[0]}` : "Your city or town"}
          />
          {showList ? (
            <div className="cc-pop cc-city-pop">
              <ul className="cc-list" role="listbox" id={`${id}-cities`} aria-label={cityLabel}>
                {matches.length === 0 ? (
                  <li role="presentation" className="cc-empty">
                    No city matches “{typed}”. Try another spelling, or the nearest larger city.
                  </li>
                ) : null}
                {matches.map((name, index) => (
                  <li key={name} role="presentation">
                    <button
                      type="button"
                      id={`${id}-city-${index}`}
                      role="option"
                      aria-selected={index === active}
                      tabIndex={-1}
                      className={index === active ? "cc-opt on" : "cc-opt"}
                      // Pick before the input loses focus (works for taps too).
                      onPointerDown={(event) => {
                        event.preventDefault();
                        choose(name);
                      }}
                      onClick={() => choose(name)}
                    >
                      <span className="ms" aria-hidden="true" style={{ fontSize: 18, color: "var(--pr-slate)" }}>
                        location_on
                      </span>
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {touched && !cityValid && !open ? (
          <p id={`${id}-city-err`} className="cc-err" role="alert">
            Please choose your city from the list.
          </p>
        ) : null}
      </div>
    </div>
  );
}
