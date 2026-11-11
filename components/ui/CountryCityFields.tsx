"use client";

import { useEffect, useId, useState } from "react";
import type { Country } from "@/lib/geo/countries";
import { CountrySelect, findCountry } from "@/components/ui/CountrySelect";

const cityCache = new Map<string, string[]>();

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
