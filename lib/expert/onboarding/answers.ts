import type { Json } from "@/types/database";
import {
  EXPERT_EXPERIENCE_RANGES,
  EXPERT_EXPERIENCE_RANGE_LABELS,
  SESSION_DURATIONS,
  type ExpertExperienceRange,
  type ExpertProfile,
  type SessionDuration,
} from "@/types/expert";

/**
 * The guided onboarding's working answers (expert_profiles.onboarding_answers,
 * 059). Shared by the client flow and the server actions; nothing here is
 * server-only.
 */

export const DRAFT_FIELDS = [
  "headline",
  "short_bio",
  "expertise_summary",
  "problems_help_with",
  "who_i_help",
  "career_highlights",
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];
export type Drafts = Record<DraftField, string>;

export const DRAFT_LABELS: Record<DraftField, string> = {
  headline: "Headline",
  short_bio: "About you",
  expertise_summary: "Your expertise",
  problems_help_with: "Problems you help with",
  who_i_help: "Who you help",
  career_highlights: "Career highlights",
};

/** Same limits as lib/validation/expert.ts. */
export const DRAFT_LIMITS: Record<DraftField, number> = {
  headline: 160,
  short_bio: 1500,
  expertise_summary: 1500,
  problems_help_with: 1500,
  who_i_help: 1000,
  career_highlights: 1500,
};

export type ExperienceRow = { title: string; organization: string; start_year: string; end_year: string };

export type OnboardingAnswers = {
  version: 1;
  /** Furthest card reached, to resume there. */
  card: number;
  categoryIds: string[];
  role: string;
  company: string;
  years: ExpertExperienceRange | "";
  problems: string[];
  who: string[];
  highlights: string[];
  experience: ExperienceRow[];
  country: string;
  city: string;
  languages: string[];
  drafts: Drafts;
  approved: DraftField[];
  price: string;
  durations: SessionDuration[];
  online: boolean;
  inPerson: boolean;
  responseTime: string;
  ngoId: string;
  percent: number;
};

export const emptyDrafts = (): Drafts =>
  Object.fromEntries(DRAFT_FIELDS.map((field) => [field, ""])) as Drafts;

const strings = (value: unknown, max = 12): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.slice(0, 200))
        .slice(0, max)
    : [];
const text = (value: unknown, max = 200) => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * Rebuild answers from the saved jsonb, falling back to whatever is already
 * on the profile (an expert who started on the classic form keeps their
 * work).
 */
export function answersFrom(
  saved: Json | null,
  profile: ExpertProfile,
  categoryIds: string[],
  durations: number[],
): OnboardingAnswers {
  const raw = (saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}) as Record<string, unknown>;
  const rawDrafts = (raw.drafts && typeof raw.drafts === "object" ? raw.drafts : {}) as Record<string, unknown>;

  const drafts = emptyDrafts();
  for (const field of DRAFT_FIELDS) {
    drafts[field] = text(rawDrafts[field], DRAFT_LIMITS[field]) || (profile[field] ?? "");
  }

  const savedExperience = Array.isArray(raw.experience) ? raw.experience : Array.isArray(profile.experience) ? profile.experience : [];
  const experience = savedExperience.slice(0, 3).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      title: text(r.title, 100),
      organization: text(r.organization, 120),
      start_year: r.start_year == null ? "" : String(r.start_year),
      end_year: r.end_year == null ? "" : String(r.end_year),
    };
  });

  const years = text(raw.years) || profile.years_experience_range || "";
  const savedDurations = Array.isArray(raw.durations) ? raw.durations.map(Number) : [];
  const durationList = (savedDurations.length ? savedDurations : durations).filter((d): d is SessionDuration =>
    (SESSION_DURATIONS as readonly number[]).includes(d),
  );

  return {
    version: 1,
    card: typeof raw.card === "number" && raw.card >= 0 ? Math.floor(raw.card) : 0,
    categoryIds: strings(raw.categoryIds).length ? strings(raw.categoryIds, 3) : categoryIds,
    role: text(raw.role, 120) || (profile.current_position ?? ""),
    company: text(raw.company, 150) || (profile.current_company ?? ""),
    years: (EXPERT_EXPERIENCE_RANGES as readonly string[]).includes(years) ? (years as ExpertExperienceRange) : "",
    problems: strings(raw.problems),
    who: strings(raw.who),
    highlights: strings(raw.highlights, 3),
    experience,
    country: text(raw.country, 100) || (profile.country ?? ""),
    city: text(raw.city, 100) || (profile.city ?? ""),
    languages: strings(raw.languages, 8).length ? strings(raw.languages, 8) : (profile.languages ?? []),
    drafts,
    approved: strings(raw.approved).filter((f): f is DraftField => (DRAFT_FIELDS as readonly string[]).includes(f)),
    price: text(raw.price, 12) || (profile.base_hourly_price != null ? String(profile.base_hourly_price) : ""),
    durations: durationList.length ? durationList : [60],
    online: typeof raw.online === "boolean" ? raw.online : profile.online_enabled || !profile.in_person_enabled,
    inPerson: typeof raw.inPerson === "boolean" ? raw.inPerson : profile.in_person_enabled,
    responseTime: text(raw.responseTime, 20) || (profile.response_time ?? ""),
    ngoId: text(raw.ngoId, 60) || (profile.supported_ngo_id ?? ""),
    percent: typeof raw.percent === "number" ? raw.percent : (profile.donation_percent ?? 10),
  };
}

export const yearsLabel = (years: OnboardingAnswers["years"]) => (years ? EXPERT_EXPERIENCE_RANGE_LABELS[years] : "");

// ---------------------------------------------------------------------------
// Chip suggestions: which cards ask the AI, and the lists used when it can't.
// ---------------------------------------------------------------------------

export const CHIP_STEPS = ["role", "problems", "who", "highlights", "titles"] as const;
export type ChipStep = (typeof CHIP_STEPS)[number];

export const FALLBACK_CHIPS: Record<ChipStep, string[]> = {
  role: ["Founder / CEO", "Senior Manager", "Director", "Consultant", "Team Lead", "Head of Department", "Freelancer", "Lecturer"],
  problems: [
    "Planning a career change",
    "Starting a new business",
    "Growing sales",
    "Building and leading a team",
    "Fixing day-to-day operations",
    "Preparing for investors",
    "Getting a first job in the field",
    "Making a big decision with confidence",
  ],
  who: [
    "First-time founders",
    "Small business owners",
    "Recent graduates",
    "Mid-career professionals",
    "New managers",
    "People switching careers",
    "NGO and public-sector teams",
  ],
  highlights: [
    "Led a team of [number] people",
    "Grew revenue by [x]% in [time]",
    "Launched [product or service] from scratch",
    "Opened [number] new branches or markets",
    "Mentored [number] people into new roles",
  ],
  titles: ["Manager", "Senior Manager", "Director", "Founder", "Consultant", "Officer", "Team Lead", "Analyst"],
};

/** Common languages offered as chips (lib/expert/profileFields.ts). */
export const LANGUAGE_CHIPS = ["Amharic", "English", "Afaan Oromoo", "Tigrinya", "Somali", "Arabic", "French"];

/** Starting price chips (ETB for 60 minutes) by experience, used when there
 * aren't enough published peers to suggest from. */
export const FALLBACK_PRICES: Record<ExpertExperienceRange | "", number[]> = {
  "": [1000, 1500, 2500],
  lt_5: [800, 1200, 1500],
  "5_9": [1500, 2000, 2500],
  "10_14": [2500, 3000, 4000],
  "15_19": [3500, 4500, 6000],
  "20_plus": [5000, 7000, 10000],
};

const joinList = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * Plain template drafts from the answers, for when the AI is unavailable.
 * Deliberately simple; the expert edits them on the same card.
 */
export function fallbackDrafts(answers: OnboardingAnswers, categoryNames: string[]): Drafts {
  const role = answers.role || "Professional";
  const field = joinList(categoryNames.map((n) => n.toLowerCase()));
  const years = yearsLabel(answers.years).toLowerCase();
  const problems = answers.problems.map((p) => p.replace(/\.$/, ""));
  const who = answers.who;
  const at = answers.company ? ` at ${answers.company}` : "";

  return {
    headline: `${role}${field ? ` helping with ${field}` : ""}`.slice(0, 160),
    short_bio: [
      `I'm ${/^[aeiou]/i.test(role) ? "an" : "a"} ${role.toLowerCase()}${at}${years ? ` with ${years} of experience` : ""}.`,
      problems.length ? `I help with ${joinList(problems.map((p) => p.toLowerCase()))}.` : "",
      who.length ? `I mostly work with ${joinList(who.map((w) => w.toLowerCase()))}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    expertise_summary: field
      ? `Practical advice on ${field}, based on hands-on experience${at}.`
      : `Practical advice based on hands-on experience${at}.`,
    problems_help_with: problems.map((p) => `• ${p}`).join("\n"),
    who_i_help: who.map((w) => `• ${w}`).join("\n"),
    career_highlights: answers.highlights.map((h) => `• ${h}`).join("\n"),
  };
}
