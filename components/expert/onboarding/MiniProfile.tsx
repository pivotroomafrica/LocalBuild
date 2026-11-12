"use client";

import { yearsLabel, type OnboardingAnswers } from "@/lib/expert/onboarding/answers";

/** The profile card filling itself in as the expert answers. */
export function MiniProfile({
  answers,
  fullName,
  photoUrl,
  categoryNames,
  percentDone,
}: {
  answers: OnboardingAnswers;
  fullName: string;
  photoUrl: string | null;
  categoryNames: string[];
  percentDone: number;
}) {
  const headline = answers.drafts.headline || answers.role;
  const place = [answers.city, answers.country].filter(Boolean).join(", ");
  const price = Number(answers.price);

  return (
    <div className="ob-mini" aria-label="Your profile so far">
      <div className="ob-mini-top">
        <div className="ob-mini-photo">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL or local preview
            <img src={photoUrl} alt="" />
          ) : (
            <span className="ms" aria-hidden="true">
              person
            </span>
          )}
        </div>
        <div className="ob-ring" style={{ "--p": percentDone } as React.CSSProperties} aria-hidden="true">
          <span className="num">{percentDone}%</span>
        </div>
      </div>
      <p className="ob-mini-name">{fullName || "Your name"}</p>
      <p className={headline ? "ob-mini-head" : "ob-mini-head ob-ghost"}>{headline || "Your headline appears here"}</p>
      {answers.company ? <p className="ob-mini-meta">{answers.company}</p> : null}
      <div className="ob-mini-tags">
        {categoryNames.length
          ? categoryNames.map((name) => (
              <span key={name} className="topic ob-pop">
                {name}
              </span>
            ))
          : null}
      </div>
      <ul className="ob-mini-facts">
        {answers.years ? (
          <li className="ob-pop">
            <span className="ms" aria-hidden="true">
              workspace_premium
            </span>
            {yearsLabel(answers.years)}
          </li>
        ) : null}
        {place ? (
          <li className="ob-pop">
            <span className="ms" aria-hidden="true">
              location_on
            </span>
            {place}
          </li>
        ) : null}
        {answers.languages.length ? (
          <li className="ob-pop">
            <span className="ms" aria-hidden="true">
              translate
            </span>
            {answers.languages.join(", ")}
          </li>
        ) : null}
        {price > 0 ? (
          <li className="ob-pop">
            <span className="ms" aria-hidden="true">
              payments
            </span>
            <span className="num">{price.toLocaleString()} ETB</span>&nbsp;/ 60 min
          </li>
        ) : null}
      </ul>
      {answers.drafts.short_bio ? <p className="ob-mini-bio ob-pop">{answers.drafts.short_bio}</p> : null}
    </div>
  );
}
