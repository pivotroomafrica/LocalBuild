import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;
export type CustomerProfile = Tables<"customer_profiles">;
export type Industry = Tables<"industries">;

export type Role = "customer" | "expert" | "admin";
export type AccountStatus = "active" | "suspended" | "deleted";

export const EMPLOYMENT_TYPES = [
  "founder_owner",
  "executive_manager",
  "employee",
  "freelancer_consultant",
  "student",
  "between_roles",
  "other",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  founder_owner: "Founder / Business Owner",
  executive_manager: "Executive / Manager",
  employee: "Employee",
  freelancer_consultant: "Freelancer / Consultant",
  student: "Student",
  between_roles: "Between Roles",
  other: "Other",
};

export const EXPERIENCE_RANGES = [
  "student_none",
  "lt_1",
  "1_3",
  "4_6",
  "7_10",
  "11_15",
  "15_plus",
] as const;

export type ExperienceRange = (typeof EXPERIENCE_RANGES)[number];

export const EXPERIENCE_RANGE_LABELS: Record<ExperienceRange, string> = {
  student_none: "Student / No Professional Experience",
  lt_1: "Less Than 1 Year",
  "1_3": "1–3 Years",
  "4_6": "4–6 Years",
  "7_10": "7–10 Years",
  "11_15": "11–15 Years",
  "15_plus": "15+ Years",
};

/** Personal-information fields a customer may edit on their own profile. */
export type ProfilePersonalInput = {
  full_name: string;
  phone: string;
  country: string;
  city: string;
};

/** Professional-profile fields a customer may edit. */
export type CustomerProfileInput = {
  current_role: string;
  employment_type: EmploymentType | "";
  company_name: string;
  industry_id: string;
  years_experience_range: ExperienceRange | "";
  linkedin_url: string;
};
