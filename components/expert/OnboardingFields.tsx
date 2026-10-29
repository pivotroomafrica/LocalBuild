"use client";

import { useState } from "react";
import { ExperienceEditor } from "@/components/expert/ExperienceEditor";
import { COMMON_LANGUAGES } from "@/lib/expert/profileFields";
import { EXPERT_EXPERIENCE_RANGES, EXPERT_EXPERIENCE_RANGE_LABELS, MAX_EXPERT_CATEGORIES } from "@/types/expert";
import type { ExpertProfile, ExpertCategory } from "@/types/expert";
import { CountryCityFields } from "@/components/ui/CountryCityFields";

/**
 * The onboarding questions (website onboarding, steps 1 and 2), shared by
 * the expert's own application and the admin editor so both always ask
 * and save exactly the same things.
 */

function Question({
  n,
  label,
  hint,
  required,
  htmlFor,
  children,
}: {
  n: number;
  label: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="oq">
      <div className="oq-head">
        <span className="oq-n num" aria-hidden="true">
          {String(n).padStart(2, "0")}
        </span>
        <label htmlFor={htmlFor} className="oq-label">
          {label}
          {required ? <span className="oq-req"> · required</span> : null}
        </label>
      </div>
      {hint ? <p className="oq-hint">{hint}</p> : null}
      {children}
    </div>
  );
}

function Counted({
  id,
  name,
  defaultValue,
  max,
  rows,
  placeholder,
}: {
  id: string;
  name: string;
  defaultValue: string;
  max: number;
  rows: number;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <textarea
        id={id}
        name={name}
        className="input"
        rows={rows}
        maxLength={max}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
      <span className="oq-count num">
        {value.length}/{max}
      </span>
    </>
  );
}

/** Step 1, "Who you are" (the photo is uploaded separately). The name
 * question shows only when `fullName` is given (the expert's own form). */
export function IdentityQuestions({
  profile,
  fullName,
  startAt = 1,
}: {
  profile: ExpertProfile;
  fullName?: string;
  startAt?: number;
}) {
  const known = (profile.languages ?? []).filter((l) => COMMON_LANGUAGES.includes(l));
  const other = (profile.languages ?? []).filter((l) => !COMMON_LANGUAGES.includes(l)).join(", ");
  const first = fullName === undefined ? startAt : startAt + 1;

  return (
    <>
      {fullName !== undefined ? (
        <Question n={startAt} label="Your full name, as clients should see it" required htmlFor="q-name">
          <input
            id="q-name"
            name="full_name"
            className="input"
            maxLength={100}
            required
            defaultValue={fullName}
            autoComplete="name"
            placeholder="e.g. Hailemichael Adugna"
          />
        </Question>
      ) : null}

      <Question n={first} label="What's your current role, and where?" required htmlFor="q-position">
        <div className="oq-two">
          <input
            id="q-position"
            name="current_position"
            className="input"
            maxLength={120}
            defaultValue={profile.current_position ?? ""}
            placeholder="Role, e.g. Founder & CEO"
          />
          <input
            aria-label="Company or organisation"
            name="current_company"
            className="input"
            maxLength={150}
            defaultValue={profile.current_company ?? ""}
            placeholder="Company, e.g. Sidama Coffee Exports"
          />
        </div>
      </Question>

      <Question
        n={first + 1}
        label="Describe yourself in one line a client would recognise."
        hint="For example: Took a coffee exporter from 1 to 20 containers a year."
        required
        htmlFor="q-headline"
      >
        <Counted id="q-headline" name="headline" defaultValue={profile.headline ?? ""} max={160} rows={2} />
      </Question>

      <Question n={first + 2} label="How many years have you worked in this field?" required htmlFor="q-years">
        <select id="q-years" name="years_experience_range" className="input" defaultValue={profile.years_experience_range ?? ""}>
          <option value="">Choose one</option>
          {EXPERT_EXPERIENCE_RANGES.map((value) => (
            <option key={value} value={value}>
              {EXPERT_EXPERIENCE_RANGE_LABELS[value]}
            </option>
          ))}
        </select>
      </Question>

      <Question n={first + 3} label="Where are you based?" required>
        <CountryCityFields defaultCountry={profile.country} defaultCity={profile.city} />
      </Question>

      <Question n={first + 4} label="Which languages can you hold a session in?">
        <div className="oq-ticks" role="group" aria-label="Session languages">
          {COMMON_LANGUAGES.map((language) => (
            <label key={language} className="oq-tick">
              <input type="checkbox" name="languages" value={language} defaultChecked={known.includes(language)} />
              {language}
            </label>
          ))}
        </div>
        <input
          aria-label="Other languages"
          name="languages_other"
          className="input"
          maxLength={120}
          defaultValue={other}
          placeholder="Other languages, separated by commas"
        />
      </Question>

      <Question n={first + 5} label="Your LinkedIn (optional)" hint="Not required. If you have one, it helps our review." htmlFor="q-linkedin">
        <input
          id="q-linkedin"
          name="linkedin_url"
          type="text"
          className="input"
          maxLength={300}
          defaultValue={profile.linkedin_url ?? ""}
          placeholder="https://www.linkedin.com/in/yourname"
        />
      </Question>
    </>
  );
}

/** Step 2, "What you've solved" (questions 8-14). */
export function ExpertiseQuestions({
  profile,
  categories,
  selectedCategoryIds,
  startAt = 8,
}: {
  profile: ExpertProfile;
  categories: ExpertCategory[];
  selectedCategoryIds: string[];
  startAt?: number;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedCategoryIds));
  const full = picked.size >= MAX_EXPERT_CATEGORIES;

  return (
    <>
      <Question
        n={startAt}
        label={`Which areas do you advise on? Pick up to ${MAX_EXPERT_CATEGORIES}.`}
        required
      >
        <div className="oq-ticks" role="group" aria-label="Areas">
          {categories.map((category) => {
            const on = picked.has(category.id);
            return (
              <label key={category.id} className={!on && full ? "oq-tick off" : "oq-tick"}>
                <input
                  type="checkbox"
                  name="category_ids"
                  value={category.id}
                  checked={on}
                  disabled={!on && full}
                  onChange={() =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (next.has(category.id)) next.delete(category.id);
                      else if (next.size < MAX_EXPERT_CATEGORIES) next.add(category.id);
                      return next;
                    })
                  }
                />
                {category.name}
              </label>
            );
          })}
        </div>
        <span className="oq-count num">
          {picked.size}/{MAX_EXPERT_CATEGORIES} picked
        </span>
      </Question>

      <Question
        n={startAt + 1}
        label="What problems can a client bring you? List 3–5, one per line, in the client's own words."
        hint={'For example: "Getting my first export buyer." "Bank loan or a partner for a second branch?"'}
        required
        htmlFor="q-problems"
      >
        <Counted id="q-problems" name="problems_help_with" defaultValue={profile.problems_help_with ?? ""} max={1500} rows={5} />
      </Question>

      <Question
        n={startAt + 2}
        label="Who gets the most out of a session with you?"
        hint="For example: first-time exporters and family businesses doing their first deal abroad."
        required
        htmlFor="q-who"
      >
        <Counted id="q-who" name="who_i_help" defaultValue={profile.who_i_help ?? ""} max={1000} rows={3} />
      </Question>

      <Question
        n={startAt + 3}
        label="In 2–3 sentences, who are you and what have you built?"
        hint='This becomes the "About" on your profile.'
        required
        htmlFor="q-bio"
      >
        <Counted id="q-bio" name="short_bio" defaultValue={profile.short_bio ?? ""} max={1500} rows={4} />
      </Question>

      <Question
        n={startAt + 4}
        label="What do you know that most people don't? Be specific."
        hint="For example: letters of credit with European roasters; which Ethiopian banks lend against export contracts."
        required
        htmlFor="q-expertise"
      >
        <Counted id="q-expertise" name="expertise_summary" defaultValue={profile.expertise_summary ?? ""} max={1500} rows={4} />
      </Question>

      <Question
        n={startAt + 5}
        label="Name 2–3 results you can point to, with numbers if possible."
        hint="Optional, but it builds trust. For example: raised ETB 40M for a seed round; opened 4 branches in Addis."
        htmlFor="q-highlights"
      >
        <Counted id="q-highlights" name="career_highlights" defaultValue={profile.career_highlights ?? ""} max={1500} rows={3} />
      </Question>

      <Question n={startAt + 6} label="Your last 1–3 roles" hint="Optional. Leave the end year empty for a role you still hold.">
        <ExperienceEditor initial={profile.experience} />
      </Question>
    </>
  );
}
