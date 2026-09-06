import type { FieldResult } from "@/lib/validation/profile";
import { validateCountry, validateCity, validateLinkedinUrl } from "@/lib/validation/profile";
import {
  EXPERT_EXPERIENCE_RANGES,
  SESSION_DURATIONS,
  type ExpertExperienceRange,
  type SessionDuration,
} from "@/types/expert";

const ok = <T>(value: T): FieldResult<T> => ({ valid: true, value });
const err = (error: string): FieldResult<never> => ({ valid: false, error });

// Country/city/LinkedIn rules are identical to the customer profile's, so
// re-export rather than duplicate.
export { validateCountry as validateExpertCountry, validateCity as validateExpertCity };
export const validateExpertLinkedinUrl = validateLinkedinUrl;

export function validateHeadline(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 160) return err("Headline must be 160 characters or fewer.");
  return ok(value);
}

export function validateCurrentPosition(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 120) return err("Current position must be 120 characters or fewer.");
  return ok(value);
}

export function validateCurrentCompany(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 150) return err("Current company must be 150 characters or fewer.");
  return ok(value);
}

export function validateShortBio(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 1500) return err("Bio must be 1500 characters or fewer.");
  return ok(value);
}

export function validateExpertiseSummary(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 1500) return err("Expertise summary must be 1500 characters or fewer.");
  return ok(value);
}

export function validateProblemsHelpWith(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 1500) return err("This must be 1500 characters or fewer.");
  return ok(value);
}

export function validateWhoIHelp(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 1000) return err("This must be 1000 characters or fewer.");
  return ok(value);
}

export function validateCareerHighlights(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 1500) return err("Career highlights must be 1500 characters or fewer.");
  return ok(value);
}

export function validateExpertExperienceRange(
  input: string,
): FieldResult<ExpertExperienceRange | null> {
  if (!input) return ok(null);
  if (!(EXPERT_EXPERIENCE_RANGES as readonly string[]).includes(input)) {
    return err("Select a valid years of experience range.");
  }
  return ok(input as ExpertExperienceRange);
}

export function validateSessionDuration(input: number): FieldResult<SessionDuration> {
  if (!(SESSION_DURATIONS as readonly number[]).includes(input)) {
    return err("Select a supported session duration.");
  }
  return ok(input as SessionDuration);
}

export function validateBasePrice(input: string): FieldResult<number> {
  const value = Number(input);
  if (!input.trim() || Number.isNaN(value)) return err("Enter a valid price.");
  if (value <= 0) return err("Price must be greater than 0.");
  if (value > 10_000_000) return err("Enter a realistic price.");
  // numeric(12,2): at most 2 decimal places.
  if (Math.round(value * 100) !== value * 100) {
    return err("Price can have at most 2 decimal places.");
  }
  return ok(Math.round(value * 100) / 100);
}

export function validateSessionFormat(
  onlineEnabled: boolean,
  inPersonEnabled: boolean,
): FieldResult<true> {
  if (!onlineEnabled && !inPersonEnabled) {
    return err("Select at least one session format (online or in person).");
  }
  return ok(true);
}
