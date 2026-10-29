"use client";

import { useEffect, useState } from "react";
import { initialsOf } from "@/components/site/format";
import { EXPERT_EXPERIENCE_RANGE_LABELS, type ExpertExperienceRange } from "@/types/expert";

export type PreviewValues = {
  fullName: string;
  currentPosition: string;
  currentCompany: string;
  headline: string;
  yearsRange: string;
  city: string;
  country: string;
  languages: string[];
  shortBio: string;
  whoIHelp: string;
  problemsHelpWith: string;
  expertiseSummary: string;
  careerHighlights: string;
  categoryIds: string[];
};

/** Fired by PhotoUpload with a local URL of the freshly cropped photo. */
export const PHOTO_PREVIEW_EVENT = "pivotroom:photo-preview";

const TEXT_FIELDS: [keyof PreviewValues, string][] = [
  ["fullName", "full_name"],
  ["currentPosition", "current_position"],
  ["currentCompany", "current_company"],
  ["headline", "headline"],
  ["yearsRange", "years_experience_range"],
  ["city", "city"],
  ["country", "country"],
  ["shortBio", "short_bio"],
  ["whoIHelp", "who_i_help"],
  ["problemsHelpWith", "problems_help_with"],
  ["expertiseSummary", "expertise_summary"],
  ["careerHighlights", "career_highlights"],
];

/** Saved values, overridden by whatever the form on this step currently holds. */
function readForm(form: HTMLFormElement, saved: PreviewValues): PreviewValues {
  const data = new FormData(form);
  const has = (name: string) => form.elements.namedItem(name) != null;
  const next: PreviewValues = { ...saved };
  for (const [key, name] of TEXT_FIELDS) {
    if (has(name)) (next[key] as string) = String(data.get(name) ?? "").trim();
  }
  if (has("languages") || has("languages_other")) {
    const other = String(data.get("languages_other") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    next.languages = [...data.getAll("languages").map(String), ...other];
  }
  if (has("category_ids")) next.categoryIds = data.getAll("category_ids").map(String);
  return next;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="lp-empty">{children}</span>;
}

/**
 * Desktop-only panel beside the application form: a compact copy of the
 * public profile that updates as the expert types.
 */
export function LiveProfilePreview({
  formId,
  saved,
  photoUrl,
  categories,
}: {
  formId: string;
  saved: PreviewValues;
  photoUrl: string | null;
  categories: { id: string; name: string }[];
}) {
  const [values, setValues] = useState(saved);
  const [photo, setPhoto] = useState(photoUrl);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    // Clicks cover custom pickers (country list) that change hidden inputs.
    const update = () => window.setTimeout(() => setValues(readForm(form, saved)), 0);
    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("click", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
      form.removeEventListener("click", update);
    };
  }, [formId, saved]);

  useEffect(() => {
    const onPhoto = (event: Event) => setPhoto((event as CustomEvent<string>).detail);
    window.addEventListener(PHOTO_PREVIEW_EVENT, onPhoto);
    return () => window.removeEventListener(PHOTO_PREVIEW_EVENT, onPhoto);
  }, []);

  const role = [values.currentPosition, values.currentCompany].filter(Boolean).join(" at ");
  const location = [values.city, values.country].filter(Boolean).join(", ");
  const years = EXPERT_EXPERIENCE_RANGE_LABELS[values.yearsRange as ExpertExperienceRange];
  const firstName = values.fullName.split(/\s+/)[0] || "you";
  const categoryNames = values.categoryIds
    .map((id) => categories.find((category) => category.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <aside className="lp" aria-label="Live preview of your public profile">
      <p className="lp-label">
        <span className="lp-dot" aria-hidden="true" />
        Live preview · how clients will see you
      </p>
      <div className="lp-card">
        <div className="lp-top">
          <div className="lp-photo">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URL or local preview
              <img src={photo} alt="" />
            ) : (
              <span aria-hidden="true">{initialsOf(values.fullName) || "?"}</span>
            )}
          </div>
          <div className="lp-id">
            <span className="pill-blue lp-pill">
              <span className="ms" aria-hidden="true">
                verified
              </span>
              Vetted expert
            </span>
            <p className="lp-name">{values.fullName || <Placeholder>Your name</Placeholder>}</p>
            <p className="lp-role">{role || <Placeholder>Your role and company</Placeholder>}</p>
          </div>
        </div>

        <p className="lp-headline">{values.headline || <Placeholder>Your one-line description</Placeholder>}</p>

        <ul className="lp-facts">
          {location ? (
            <li>
              <span className="ms" aria-hidden="true">
                location_on
              </span>
              {location}
            </li>
          ) : null}
          {values.languages.length > 0 ? (
            <li>
              <span className="ms" aria-hidden="true">
                chat_bubble
              </span>
              {values.languages.join(", ")}
            </li>
          ) : null}
          {years ? (
            <li>
              <span className="ms" aria-hidden="true">
                work_history
              </span>
              {years}
            </li>
          ) : null}
        </ul>

        {values.shortBio || values.whoIHelp ? (
          <section className="lp-sec">
            <h3>About</h3>
            {values.shortBio ? <p>{values.shortBio}</p> : null}
            {values.whoIHelp ? <p>{values.whoIHelp}</p> : null}
          </section>
        ) : null}

        {categoryNames.length > 0 || values.problemsHelpWith ? (
          <section className="lp-sec">
            <h3>Ask {firstName} about</h3>
            {categoryNames.length > 0 ? (
              <ul className="tags">
                {categoryNames.map((name) => (
                  <li key={name} className="tag">
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
            {values.problemsHelpWith ? <p>{values.problemsHelpWith}</p> : null}
          </section>
        ) : null}

        {values.expertiseSummary ? (
          <section className="lp-sec">
            <h3>Expertise</h3>
            <p>{values.expertiseSummary}</p>
          </section>
        ) : null}

        {values.careerHighlights ? (
          <section className="lp-sec">
            <h3>Highlights</h3>
            <p>{values.careerHighlights}</p>
          </section>
        ) : null}
      </div>
      <p className="lp-foot">Prices and booking appear on the right of your real profile.</p>
    </aside>
  );
}
