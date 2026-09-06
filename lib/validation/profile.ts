import { normalizePhone } from "@/lib/utils/phone";
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_RANGES,
  type EmploymentType,
  type ExperienceRange,
} from "@/types/profile";

export type FieldResult<T> =
  | { valid: true; value: T }
  | { valid: false; error: string };

const ok = <T>(value: T): FieldResult<T> => ({ valid: true, value });
const err = (error: string): FieldResult<never> => ({ valid: false, error });

export function validateFullName(input: string): FieldResult<string> {
  const value = input.trim();
  if (!value) return err("Full name is required.");
  if (value.length > 100) return err("Full name must be 100 characters or fewer.");
  return ok(value);
}

export function validatePhone(input: string): FieldResult<string> {
  const normalized = normalizePhone(input);
  if (!normalized) return err("Enter a valid phone number.");
  return ok(normalized);
}

export function validateOptionalPhone(input: string): FieldResult<string | null> {
  if (!input.trim()) return ok(null);
  return validatePhone(input);
}

export function validateCountry(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 100) return err("Country must be 100 characters or fewer.");
  return ok(value);
}

export function validateCity(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 100) return err("City must be 100 characters or fewer.");
  return ok(value);
}

export function validatePassword(input: string): FieldResult<string> {
  if (input.length < 8) return err("Password must be at least 8 characters.");
  return ok(input);
}

export function validateCurrentRole(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 100) return err("Current role must be 100 characters or fewer.");
  return ok(value);
}

export function validateCompanyName(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 150) return err("Company / Organization must be 150 characters or fewer.");
  return ok(value);
}

const LINKEDIN_PATTERN = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/.+$/i;

export function validateLinkedinUrl(input: string): FieldResult<string | null> {
  const value = input.trim();
  if (!value) return ok(null);
  if (value.length > 300) return err("LinkedIn URL must be 300 characters or fewer.");
  if (!LINKEDIN_PATTERN.test(value)) {
    return err("Enter a valid LinkedIn profile URL, e.g. https://www.linkedin.com/in/yourname.");
  }
  return ok(value);
}

export function validateEmploymentType(
  input: string,
): FieldResult<EmploymentType | null> {
  if (!input) return ok(null);
  if (!(EMPLOYMENT_TYPES as readonly string[]).includes(input)) {
    return err("Select a valid employment type.");
  }
  return ok(input as EmploymentType);
}

export function validateExperienceRange(
  input: string,
): FieldResult<ExperienceRange | null> {
  if (!input) return ok(null);
  if (!(EXPERIENCE_RANGES as readonly string[]).includes(input)) {
    return err("Select a valid years of experience range.");
  }
  return ok(input as ExperienceRange);
}
