import type { Json } from "@/types/database";

/** Validation for the 049a profile details (languages, stated reply time,
 * experience timeline). Shared by the server action; the database checks
 * the same limits. */

export const RESPONSE_TIME_OPTIONS = [
  { value: "few_hours", label: "Within a few hours" },
  { value: "one_day", label: "Within a day" },
  { value: "two_days", label: "Within two days" },
] as const;

const MAX_LANGUAGES = 8;
const MAX_EXPERIENCE = 12;

type Result<T> = { valid: true; value: T } | { valid: false; error: string };

export function validateLanguages(raw: string): Result<string[]> {
  const seen = new Set<string>();
  const languages: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const name = part.trim().replace(/\s+/g, " ");
    if (!name) continue;
    if (name.length > 40) return { valid: false, error: "Each language should be under 40 characters." };
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    languages.push(name.charAt(0).toUpperCase() + name.slice(1));
  }
  if (languages.length > MAX_LANGUAGES) return { valid: false, error: `List up to ${MAX_LANGUAGES} languages.` };
  return { valid: true, value: languages };
}

export function validateResponseTime(raw: string): Result<string | null> {
  if (!raw) return { valid: true, value: null };
  return RESPONSE_TIME_OPTIONS.some((option) => option.value === raw)
    ? { valid: true, value: raw }
    : { valid: false, error: "Choose how quickly you reply." };
}

export type ExperienceInput = { start_year: number; end_year: number | null; title: string; organization: string };

export function validateExperience(raw: string): Result<Json> {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    return { valid: false, error: "We couldn't read your experience entries. Please try again." };
  }
  if (!Array.isArray(parsed)) return { valid: false, error: "We couldn't read your experience entries." };

  const thisYear = new Date().getFullYear();
  const entries: ExperienceInput[] = [];
  for (const item of parsed) {
    const row = (item ?? {}) as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    const organization = String(row.organization ?? "").trim();
    const startText = String(row.start_year ?? "").trim();
    const endText = String(row.end_year ?? "").trim();
    // A completely empty row is just an unused line in the editor.
    if (!title && !organization && !startText && !endText) continue;

    const startYear = Number(startText);
    const endYear = endText === "" ? null : Number(endText);
    if (!title) return { valid: false, error: "Each experience entry needs a role or title." };
    if (title.length > 100 || organization.length > 120) {
      return { valid: false, error: "Keep each role under 100 characters and each organisation under 120." };
    }
    if (!Number.isInteger(startYear) || startYear < 1950 || startYear > thisYear) {
      return { valid: false, error: `Enter a start year between 1950 and ${thisYear} for "${title}".` };
    }
    if (endYear !== null && (!Number.isInteger(endYear) || endYear < startYear || endYear > thisYear)) {
      return { valid: false, error: `The end year for "${title}" must be between its start year and ${thisYear}, or left empty for now.` };
    }
    entries.push({ start_year: startYear, end_year: endYear, title, organization });
  }
  if (entries.length > MAX_EXPERIENCE) return { valid: false, error: `Add up to ${MAX_EXPERIENCE} experience entries.` };
  return { valid: true, value: entries };
}
