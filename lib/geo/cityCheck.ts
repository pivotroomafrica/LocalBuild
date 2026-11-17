import { readFile } from "node:fs/promises";
import path from "node:path";
import { COUNTRIES } from "@/lib/geo/countries";

const lists = new Map<string, string[] | null>();

/** The city list the form offers for a country (public/geo/cities), or
 * null when there is none or it can't be read. */
async function citiesFor(code: string): Promise<string[] | null> {
  if (lists.has(code)) return lists.get(code)!;
  let list: string[] | null = null;
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "geo", "cities", `${code}.json`), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) list = parsed.filter((c): c is string => typeof c === "string");
  } catch {
    list = null;
  }
  lists.set(code, list);
  return list;
}

/**
 * The city must be one from the country's list (the form only lets people
 * pick from it). Returns the list's spelling, or an error. A country with
 * no list, or a list the server can't read, accepts the text as typed.
 */
export async function checkListedCity(
  countryName: string | null | undefined,
  city: string | null | undefined,
): Promise<{ city: string | null } | { error: string }> {
  const value = (city ?? "").trim();
  if (!value) return { city: null };
  const key = (countryName ?? "").trim().toLowerCase();
  const country = COUNTRIES.find((c) => c.name.toLowerCase() === key);
  if (!country?.hasCities) return { city: value };
  const list = await citiesFor(country.code);
  if (!list) return { city: value };
  const found = list.find((name) => name.toLowerCase() === value.toLowerCase());
  return found ? { city: found } : { error: `Choose your city from the list for ${country.name}.` };
}
