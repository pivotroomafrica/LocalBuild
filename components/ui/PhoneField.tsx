"use client";

import { useId, useState } from "react";
import { COUNTRIES, type Country } from "@/lib/geo/countries";
import { CountrySelect } from "@/components/ui/CountrySelect";

/** Countries sharing a calling code: the one chosen when reading a saved number. */
const PREFERRED_FOR_DIAL: Record<string, string> = { "+1": "US", "+7": "RU", "+44": "GB", "+61": "AU" };

function byCode(code: string) {
  return COUNTRIES.find((c) => c.code === code);
}

/** Splits a saved "+251912345678" into its country and the local part. */
function splitNumber(value: string | null | undefined): { country: Country | undefined; local: string } {
  const number = (value ?? "").replace(/[\s\-()]/g, "");
  if (!number.startsWith("+")) return { country: undefined, local: value ?? "" };
  const matches = COUNTRIES.filter((c) => c.dial && number.startsWith(c.dial)).sort(
    (a, b) => b.dial.length - a.dial.length,
  );
  if (matches.length === 0) return { country: undefined, local: number };
  const dial = matches[0].dial;
  const country = byCode(PREFERRED_FOR_DIAL[dial] ?? "") ?? matches.find((c) => c.code === "ET") ?? matches[0];
  return { country, local: number.slice(dial.length) };
}

/** Calling code + local number as one international number. A number typed
 * with its own "+" or "00" is kept as typed; a leading 0 is dropped. */
function joinNumber(country: Country | undefined, local: string): string {
  const typed = local.trim();
  if (!typed) return "";
  if (typed.startsWith("+") || typed.startsWith("00")) return typed;
  const digits = typed.replace(/[\s\-()]/g, "").replace(/^0+/, "");
  return `${country?.dial ?? ""}${digits}`;
}

/**
 * Phone number with a calling-code picker (flags, searchable). Posts the
 * full international number as `name` (default "phone").
 */
export function PhoneField({
  label = "Phone number",
  name = "phone",
  defaultValue,
  defaultCountry = "ET",
  required = false,
  hint,
}: {
  label?: string;
  name?: string;
  defaultValue?: string | null;
  defaultCountry?: string;
  required?: boolean;
  hint?: string;
}) {
  const id = useId();
  const [initial] = useState(() => splitNumber(defaultValue));
  const [country, setCountry] = useState<Country | undefined>(initial.country ?? byCode(defaultCountry));
  const [local, setLocal] = useState(initial.local);

  return (
    <div className="field">
      <label className="label" htmlFor={`${id}-number`}>
        {label}
      </label>
      <div className="phone-row">
        <CountrySelect value={country} onChange={setCountry} listLabel="Country calling code" showDial compact />
        <input
          id={`${id}-number`}
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          maxLength={20}
          value={local}
          onChange={(event) => setLocal(event.target.value)}
          placeholder={country?.code === "ET" ? "912 345 678" : "Phone number"}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      </div>
      <input type="hidden" name={name} value={joinNumber(country, local)} />
      {hint ? (
        <p id={`${id}-hint`} className="phone-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
