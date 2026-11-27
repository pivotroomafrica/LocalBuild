"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import "./onboarding.css";
import { ChipGroup } from "@/components/expert/onboarding/ChipGroup";
import { MiniProfile } from "@/components/expert/onboarding/MiniProfile";
import { Confetti } from "@/components/expert/onboarding/Confetti";
import { PhotoUpload } from "@/components/expert/PhotoUpload";
import { MonthlyPlanPicker } from "@/components/expert/MonthlyPlanPicker";
import { planProblem } from "@/lib/availability/plan";
import { PHOTO_PREVIEW_EVENT } from "@/components/expert/LiveProfilePreview";
import { CountryCityFields } from "@/components/ui/CountryCityFields";
import {
  saveOnboardingAction,
  type OnboardingSavePart,
} from "@/lib/expert/onboarding/actions";
import { submitApplicationAction, type ExpertActionState } from "@/lib/expert/actions";
import {
  DRAFT_FIELDS,
  DRAFT_LABELS,
  DRAFT_LIMITS,
  LANGUAGE_CHIPS,
  ROLE_JOIN,
  WORK_TYPES,
  companyLabel,
  hasPlaceholder,
  splitRole,
  type ChipStep,
  type DraftField,
  type OnboardingAnswers,
} from "@/lib/expert/onboarding/answers";
import { RESPONSE_TIME_OPTIONS } from "@/lib/expert/profileDetails";
import { customerPrice, expertPayout, formatVatRate, type PlatformPricing } from "@/lib/pricing/platform";
import {
  EXPERT_EXPERIENCE_RANGES,
  EXPERT_EXPERIENCE_RANGE_LABELS,
  MAX_EXPERT_CATEGORIES,
  SESSION_DURATIONS,
  type SessionDuration,
} from "@/types/expert";

type CardId =
  | "welcome"
  | "work"
  | "field"
  | "role"
  | "problems"
  | "highlights"
  | "location"
  | "drafts"
  | "photo"
  | "price"
  | "availability"
  | "giving"
  | "submit";

type CardDef = { id: CardId; title: string; hint?: string; save?: OnboardingSavePart; chips?: ChipStep; optional?: boolean };

const CARDS: CardDef[] = [
  { id: "welcome", title: "Let's build your expert profile" },
  { id: "work", title: "Which best describes you?", hint: "Pick one, or two if you wear both hats." },
  { id: "field", title: "Which areas do you advise on?", hint: "Pick up to 3. Clients browse by these.", save: "basics" },
  {
    id: "role",
    title: "Your role and experience",
    hint: "Pick one role, or two if you hold both (like Founder & CEO).",
    save: "basics",
    chips: "role",
  },
  {
    id: "problems",
    title: "What do clients bring you, and who are they?",
    hint: "Tap the ones that are true for you.",
    chips: "problems",
  },
  {
    id: "highlights",
    title: "Anything you're proud of?",
    hint: "Optional. A result or two, in your own words. Clients trust specifics.",
    optional: true,
  },
  { id: "location", title: "Where are you, and which languages do you speak?", save: "basics" },
  { id: "drafts", title: "Here's your profile, written from your answers", save: "drafts" },
  {
    id: "photo",
    title: "Add a clear photo of your face",
    hint: "Optional. Profiles with a real photo get booked far more often. You can add one later from your profile.",
    optional: true,
  },
  { id: "price", title: "Set your price", hint: "What you charge for a 60-minute session, in ETB.", save: "pricing" },
  {
    id: "availability",
    title: "When can clients book you?",
    hint: "Give Pivotroom at least 2 hours a month. You can change this any time from your Availability page.",
    save: "availability",
  },
  {
    id: "giving",
    title: "Give part of your earnings to a cause?",
    hint: "Optional. Clients see the organisation and a gold mark, never the percentage.",
    save: "giving",
    optional: true,
  },
  { id: "submit", title: "Ready for review" },
];

const indexOf = (id: CardId) => CARDS.findIndex((card) => card.id === id);

/** Which card fixes each missing item from getCompletionChecklist(). */
const FIX_CARD: Record<string, CardId> = {
  "Professional headline": "drafts",
  "Current position": "role",
  "Years of experience": "role",
  "Short bio": "drafts",
  "Expertise summary": "drafts",
  "Problems you help with": "drafts",
  "Who you help": "drafts",
  Country: "location",
  City: "location",
  "At least 1 expertise category": "field",
  "Session pricing": "price",
};

const REQUIRED_DRAFTS: DraftField[] = ["headline", "short_bio", "expertise_summary", "problems_help_with", "who_i_help"];
const TONES = [
  { key: "shorter", label: "Shorter" },
  { key: "formal", label: "More formal" },
  { key: "warmer", label: "Warmer" },
  { key: "specific", label: "More specific" },
];
const PERCENTS = [5, 10, 25, 50];
const OFFLINE = "We couldn't save that. Please check your connection and try again.";

type ChipState = { key: string; options: string[]; source: "ai" | "fallback"; loading: boolean };

function chipKey(step: ChipStep, a: OnboardingAnswers) {
  const parts: Record<ChipStep, unknown[]> = {
    role: [a.categoryIds, a.workTypes],
    problems: [a.categoryIds, a.role, a.years],
    who: [a.categoryIds, a.role, a.problems],
    highlights: [a.role, a.problems, a.who],
    titles: [a.categoryIds, a.role, a.years],
  };
  return JSON.stringify(parts[step]);
}

/** AI calls go through a route handler so they run alongside the card saves
 * (server actions run one at a time). */
async function askAI<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/expert/onboarding-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  return (await response.json()) as T;
}

const draftInputsKey = (a: OnboardingAnswers) =>
  JSON.stringify([a.categoryIds, a.role, a.company, a.years, a.problems, a.who, a.highlights, a.experience]);

export function OnboardingFlow({
  initial,
  fullName,
  initialPhotoUrl,
  categories,
  ngos,
  pricing,
  termsAccepted,
  aiEnabled,
}: {
  initial: OnboardingAnswers;
  fullName: string;
  initialPhotoUrl: string | null;
  categories: { id: string; name: string }[];
  ngos: { id: string; name: string }[];
  pricing: PlatformPricing;
  termsAccepted: boolean;
  /** OPENAI_API_KEY is set; without it every card uses the built-in text. */
  aiEnabled: boolean;
}) {
  const [answers, setAnswers] = useState(initial);
  const answersRef = useRef(initial);
  const [card, setCard] = useState(Math.min(initial.card, CARDS.length - 1));
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  const [chips, setChips] = useState<Partial<Record<ChipStep, ChipState>>>({});
  const chipsRef = useRef(chips);
  const [drafting, setDrafting] = useState<DraftField | "all" | null>(null);
  const [draftSource, setDraftSource] = useState<"ai" | "fallback" | null>(null);
  const draftedFrom = useRef(Object.values(initial.drafts).some(Boolean) ? draftInputsKey(initial) : "");
  const [editing, setEditing] = useState<DraftField | null>(null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const [cityFilled, setCityFilled] = useState(Boolean(initial.city));
  const started = useRef(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const def = CARDS[card];
  const categoryNames = categories.filter((c) => answers.categoryIds.includes(c.id)).map((c) => c.name);

  function set(patch: Partial<OnboardingAnswers>) {
    const next = { ...answersRef.current, ...patch };
    answersRef.current = next;
    setAnswers(next);
  }

  function putChips(step: ChipStep, value: ChipState) {
    chipsRef.current = { ...chipsRef.current, [step]: value };
    setChips(chipsRef.current);
  }

  function loadChips(step: ChipStep, force = false) {
    const a = answersRef.current;
    const key = chipKey(step, a);
    const current = chipsRef.current[step];
    if (!force && current && current.key === key) return;
    putChips(step, { key, options: force ? (current?.options ?? []) : [], source: current?.source ?? "fallback", loading: true });
    askAI<{ options: string[]; source: "ai" | "fallback" }>({ kind: "chips", step, answers: a })
      .then((result) => {
        if (chipsRef.current[step]?.key !== key) return;
        putChips(step, { key, options: result.options, source: result.source, loading: false });
      })
      .catch(() => {
        if (chipsRef.current[step]?.key === key) putChips(step, { ...chipsRef.current[step]!, loading: false });
      });
  }

  async function generateDrafts(field?: DraftField, tweak?: string) {
    setDrafting(field ?? "all");
    setEditing(null);
    try {
      const result = await askAI<{ drafts: OnboardingAnswers["drafts"]; source: "ai" | "fallback" }>({
        kind: "draft",
        field,
        tweak,
        answers: answersRef.current,
      });
      const approved = field ? answersRef.current.approved.filter((f) => f !== field) : [];
      set({ drafts: result.drafts, approved });
      setDraftSource(result.source);
      if (!field) draftedFrom.current = draftInputsKey(answersRef.current);
    } catch {
      setError("We couldn't write that just now. Please try again.");
    } finally {
      setDrafting(null);
    }
  }

  /** Anything a card needs fetched when it opens. Called from event
   * handlers (and once on mount), never during render. */
  function prepare(index: number) {
    const target = CARDS[index];
    if (target.chips) loadChips(target.chips);
    if (target.id === "problems") loadChips("who");
    const a = answersRef.current;
    if (target.id === "drafts") {
      const empty = !Object.values(a.drafts).some(Boolean);
      const stale = draftedFrom.current !== draftInputsKey(a) && a.approved.length === 0;
      if (empty || stale) void generateDrafts();
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    prepare(card);
    // Only on first mount: later cards are prepared when navigated to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // PhotoUpload revokes its own preview URL when it unmounts (leaving the
    // photo card), so keep a private copy for the profile card.
    let own: string | null = null;
    const onPhoto = (event: Event) => {
      const url = (event as CustomEvent<string>).detail;
      setPhotoUrl(url);
      fetch(url)
        .then((response) => response.blob())
        .then((blob) => {
          if (own) URL.revokeObjectURL(own);
          own = URL.createObjectURL(blob);
          setPhotoUrl(own);
        })
        .catch(() => {});
    };
    window.addEventListener(PHOTO_PREVIEW_EVENT, onPhoto);
    return () => window.removeEventListener(PHOTO_PREVIEW_EVENT, onPhoto);
  }, []);

  // Leaving the page (closing the tab, switching away) keeps the working
  // answers too.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && answersRef.current.card > 0) {
        void saveOnboardingAction(answersRef.current, "progress").catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  function go(index: number, dir: "fwd" | "back") {
    setDirection(dir);
    setError(null);
    setEditing(null);
    setCard(index);
    prepare(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function queueSave(snapshot: OnboardingAnswers, part: OnboardingSavePart) {
    saveQueue.current = saveQueue.current
      .then(() => saveOnboardingAction(snapshot, part))
      .catch(() => ({ error: OFFLINE }))
      .then((result) => {
        if (result.error) setError(result.error);
      });
  }

  function readLocation() {
    const root = locationRef.current;
    if (!root) return {};
    const country = (root.querySelector('input[name="country"]') as HTMLInputElement | null)?.value ?? "";
    const city = (root.querySelector('input[name="city"]') as HTMLInputElement | null)?.value ?? "";
    return { country: country.trim(), city: city.trim() };
  }

  async function next() {
    if (!canContinue() || saving) return;
    if (def.id === "location") set(readLocation());
    if (def.id === "drafts") set({ approved: [...DRAFT_FIELDS] });
    if (def.id === "highlights") set({ highlights: answersRef.current.highlights.map((h) => h.trim()).filter(Boolean) });
    // Go to the next card that still needs an answer: cards already
    // answered on an earlier visit are skipped, up to the furthest card
    // reached. So with 3 unanswered but 4 and 5 done, 3 leads on to 6.
    // "Pick up where I left off" (welcome) starts at the first gap.
    const nextIndex = nextOpenCard(card);
    set({ card: Math.max(answersRef.current.card, nextIndex) });

    // Start fetching the next card's suggestions while this one saves.
    const nextChips = CARDS[nextIndex].chips;
    if (nextChips) loadChips(nextChips);
    if (CARDS[nextIndex].id === "problems") loadChips("who");

    const part = def.save ?? "progress";
    const snapshot = answersRef.current;
    if (part === "progress" || part === "basics") {
      // Quick cards save in the background, in order, so tapping Continue
      // feels instant. A failure shows on whatever card is open then.
      if (def.id !== "welcome") queueSave(snapshot, part);
    } else {
      // Drafts, pricing and giving can fail validation: wait for them.
      setSaving(true);
      await saveQueue.current;
      const result = await saveOnboardingAction(snapshot, part).catch(() => ({ error: OFFLINE }));
      setSaving(false);
      if (result.error) {
        setError(result.error);
        return;
      }
    }
    go(nextIndex, "fwd");
  }

  function nextOpenCard(from: number): number {
    const furthest = Math.min(answersRef.current.card, CARDS.length - 1);
    let index = from + 1;
    while (index < furthest && cardDone(CARDS[index].id, answersRef.current)) index += 1;
    return Math.min(index, CARDS.length - 1);
  }

  function canContinue(): boolean {
    return cardDone(def.id, answers, true);
  }

  /** Whether a card's answer is filled in. `live` uses what's on screen
   * (the city being typed, a draft being written); otherwise the saved
   * answers, for deciding which cards still need doing. */
  function cardDone(id: CardId, a: OnboardingAnswers, live = false): boolean {
    switch (id) {
      case "work":
        return a.workTypes.length > 0;
      case "field":
        return a.categoryIds.length > 0;
      case "role":
        return Boolean(a.role.trim() && a.company.trim() && a.years);
      case "problems":
        return a.problems.length > 0 && a.who.length > 0;
      case "highlights":
        return !a.highlights.some(hasPlaceholder);
      case "location":
        return live ? cityFilled : Boolean(a.city.trim() && a.country.trim());
      case "drafts":
        return (!live || drafting === null) && REQUIRED_DRAFTS.every((field) => a.drafts[field].trim());
      case "price":
        return Number(a.price) > 0 && a.durations.length > 0 && (a.online || a.inPerson);
      case "availability":
        return planProblem(a.plan) === null;
      default:
        return true;
    }
  }

  const progressItems = [
    answers.categoryIds.length > 0,
    Boolean(answers.role),
    Boolean(answers.years),
    answers.problems.length > 0,
    answers.who.length > 0,
    Boolean(answers.city),
    REQUIRED_DRAFTS.every((field) => answers.drafts[field]),
    Number(answers.price) > 0,
  ];
  const percentDone = Math.round((progressItems.filter(Boolean).length / progressItems.length) * 100);
  const isEmptyOptional =
    def.optional &&
    ((def.id === "highlights" && !answers.highlights.some((h) => h.trim())) ||
      (def.id === "giving" && !answers.ngoId) ||
      (def.id === "photo" && !photoUrl));

  const chipState = def.chips ? chips[def.chips] : undefined;

  return (
    <div className="ob">
      <div className="ob-top">
        <button
          type="button"
          className="ob-icon-btn"
          onClick={() => {
            // Keep what was changed on this card (say, an option unticked),
            // so a later visit resumes from the real gaps.
            if (card > 0) queueSave(answersRef.current, "progress");
            go(card - 1, "back");
          }}
          disabled={card === 0 || saving}
          aria-label="Back"
        >
          <span className="ms" aria-hidden="true">
            arrow_back
          </span>
        </button>
        <div
          className="ob-progress"
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={0}
          aria-valuemax={CARDS.length - 1}
          aria-valuenow={card}
        >
          <span style={{ width: `${(card / (CARDS.length - 1)) * 100}%` }} />
        </div>
        <Link href="/expert/application" className="ob-exit">
          Save &amp; exit
        </Link>
      </div>

      <div className={def.id !== "submit" && def.id !== "welcome" ? "ob-grid with-side" : "ob-grid"}>
        <section key={card} className={`ob-card ob-${direction}`} aria-labelledby="ob-title">
          {def.id === "welcome" ? (
            <Welcome
              resuming={initial.card > 1}
              firstName={fullName.split(/\s+/)[0]}
              city={answers.city}
              percentDone={percentDone}
              onRestart={() => go(1, "fwd")}
            />
          ) : (
            <header className="ob-head">
              <p className="ob-step num">
                {card} / {CARDS.length - 1}
                {chipState?.source === "ai" && !chipState.loading ? (
                  <span className="ob-ai">
                    <span className="ms" aria-hidden="true">
                      auto_awesome
                    </span>
                    Suggested for you
                  </span>
                ) : null}
              </p>
              <h1 id="ob-title" className="ob-title">
                {def.title}
              </h1>
              {def.hint ? <p className="ob-sub">{def.hint}</p> : null}
            </header>
          )}

          <div className="ob-body">
            {def.id === "field" ? (
              <ChipGroup
                label="Areas"
                options={categories.map((c) => c.name)}
                selected={categoryNames}
                max={MAX_EXPERT_CATEGORIES}
                allowCustom={false}
                onChange={(names) =>
                  set({ categoryIds: categories.filter((c) => names.includes(c.name)).map((c) => c.id) })
                }
              />
            ) : null}

            {def.id === "work" ? (
              <ChipGroup
                label="How you work"
                options={WORK_TYPES.map((w) => w.label)}
                selected={WORK_TYPES.filter((w) => answers.workTypes.includes(w.key)).map((w) => w.label)}
                max={2}
                allowCustom={false}
                icons={Object.fromEntries(WORK_TYPES.map((w) => [w.label, w.icon]))}
                onChange={(labels) =>
                  set({ workTypes: WORK_TYPES.filter((w) => labels.includes(w.label)).map((w) => w.key) })
                }
              />
            ) : null}

            {def.id === "role" ? (
              <>
                <ChipGroup
                  label="Your role"
                  options={chips.role?.options ?? []}
                  loading={chips.role?.loading}
                  selected={splitRole(answers.role)}
                  max={2}
                  customPlaceholder="Your job title"
                  customMaxLength={60}
                  onChange={(picked) => set({ role: picked.join(ROLE_JOIN).slice(0, 120) })}
                />
                {splitRole(answers.role).length === 2 ? (
                  <p className="ob-note ob-pop">
                    <span className="ms" aria-hidden="true">
                      visibility
                    </span>
                    Clients will see: <strong>{answers.role}</strong>
                  </p>
                ) : null}
                <MoreButton chip={chips.role} onClick={() => loadChips("role", true)} />

                <label className="label ob-label" htmlFor="ob-company">
                  {companyLabel(answers.workTypes).label}
                </label>
                <div className="field ob-field">
                  <input
                    id="ob-company"
                    className="input"
                    maxLength={150}
                    required
                    autoComplete="organization"
                    value={answers.company}
                    onChange={(e) => set({ company: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void next();
                      }
                    }}
                    placeholder={companyLabel(answers.workTypes).placeholder}
                  />
                </div>

                <p className="label ob-label">How many years of experience do you have?</p>
                <ChipGroup
                  label="Years of experience"
                  options={EXPERT_EXPERIENCE_RANGES.map((r) => EXPERT_EXPERIENCE_RANGE_LABELS[r])}
                  selected={answers.years ? [EXPERT_EXPERIENCE_RANGE_LABELS[answers.years]] : []}
                  allowCustom={false}
                  onChange={(picked) =>
                    set({ years: EXPERT_EXPERIENCE_RANGES.find((r) => EXPERT_EXPERIENCE_RANGE_LABELS[r] === picked[0]) ?? "" })
                  }
                />
              </>
            ) : null}

            {def.id === "problems" ? (
              <>
                <p className="label ob-label ob-label-first">
                  Problems clients bring you <span className="muted">(up to 6)</span>
                </p>
                <ChipGroup
                  label="Problems clients bring you"
                  options={chips.problems?.options ?? []}
                  loading={chips.problems?.loading}
                  selected={answers.problems}
                  max={6}
                  customPlaceholder="e.g. Getting a bank loan approved"
                  onChange={(problems) => set({ problems })}
                />
                <MoreButton chip={chips.problems} onClick={() => loadChips("problems", true)} />

                <p className="label ob-label">
                  Who you help most <span className="muted">(up to 4)</span>
                </p>
                <ChipGroup
                  label="Who you help most"
                  options={chips.who?.options ?? []}
                  loading={chips.who?.loading}
                  selected={answers.who}
                  max={4}
                  customPlaceholder="e.g. Coffee exporters"
                  onChange={(who) => set({ who })}
                />
                <MoreButton chip={chips.who} onClick={() => loadChips("who", true)} />
              </>
            ) : null}

            {def.id === "highlights" ? (
              <Highlights list={answers.highlights} onChange={(highlights) => set({ highlights })} />
            ) : null}

            {def.id === "location" ? (
              <>
                <div ref={locationRef} className="ob-field">
                  <CountryCityFields
                    defaultCountry={answers.country || null}
                    defaultCity={answers.city}
                    required
                    onCityChange={(city, valid) => setCityFilled(valid && Boolean(city))}
                  />
                </div>
                <p className="label ob-label">Languages you can hold a session in</p>
                <ChipGroup
                  label="Languages"
                  layout="pills"
                  options={LANGUAGE_CHIPS}
                  selected={answers.languages}
                  max={8}
                  customPlaceholder="Another language"
                  customMaxLength={40}
                  onChange={(languages) => set({ languages })}
                />
              </>
            ) : null}

            {def.id === "drafts" ? (
              <Drafts
                answers={answers}
                drafting={drafting}
                source={aiEnabled ? draftSource : "fallback"}
                editing={editing}
                setEditing={setEditing}
                onEdit={(field, value) =>
                  set({
                    drafts: { ...answersRef.current.drafts, [field]: value },
                    approved: answersRef.current.approved.filter((f) => f !== field),
                  })
                }
                onApprove={(field) =>
                  set({
                    approved: answersRef.current.approved.includes(field)
                      ? answersRef.current.approved
                      : [...answersRef.current.approved, field],
                  })
                }
                onRegenerate={(field, tweak) => void generateDrafts(field, tweak)}
              />
            ) : null}

            {def.id === "photo" ? (
              <div className="ob-photo">
                <PhotoUpload currentPhotoUrl={photoUrl} />
              </div>
            ) : null}

            {def.id === "price" ? (
              <Price answers={answers} pricing={pricing} onChange={set} />
            ) : null}

            {def.id === "availability" ? (
              <MonthlyPlanPicker plan={answers.plan} onChange={(plan) => set({ plan })} />
            ) : null}

            {def.id === "giving" ? (
              <Giving answers={answers} ngos={ngos} firstName={fullName.split(/\s+/)[0]} onChange={set} />
            ) : null}

            {def.id === "submit" ? (
              <Submit
                termsAccepted={termsAccepted}
                onFix={(id) => go(indexOf(id), "back")}
                mini={
                  <MiniProfile
                    answers={answers}
                    fullName={fullName}
                    photoUrl={photoUrl}
                    categoryNames={categoryNames}
                    percentDone={percentDone}
                  />
                }
              />
            ) : null}
          </div>

          {error ? (
            <p className="notice err" role="alert">
              {error}
            </p>
          ) : null}

          {def.id !== "submit" ? (
            <div className="ob-foot">
              <button type="button" className="btn btn-ink md ob-go" onClick={next} disabled={!canContinue() || saving}>
                {saving
                  ? "Saving…"
                  : def.id === "welcome"
                    ? initial.card > 1
                      ? "Pick up where I left off"
                      : "Start my profile"
                    : isEmptyOptional
                      ? "Skip for now"
                      : def.id === "drafts"
                        ? "Looks good, continue"
                        : "Continue"}
                <span className="ms" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            </div>
          ) : null}
        </section>

        {def.id !== "submit" && def.id !== "welcome" ? (
          <aside className="ob-side">
            <MiniProfile
              answers={answers}
              fullName={fullName}
              photoUrl={photoUrl}
              categoryNames={categoryNames}
              percentDone={percentDone}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The first screen is about them, not the form: a specific person who needs
 * what they know (the reason to bother), then the three quiet worries --
 * effort, words, risk -- answered one line each.
 */
function Welcome({
  resuming,
  firstName,
  city,
  percentDone,
  onRestart,
}: {
  resuming: boolean;
  firstName: string;
  city: string;
  percentDone: number;
  onRestart: () => void;
}) {
  const name = firstName ? `${firstName}, ` : "";
  if (resuming) {
    return (
      <header className="ob-head ob-welcome">
        <span className="ob-badge" aria-hidden="true">
          <span className="ms">waving_hand</span>
        </span>
        <h1 id="ob-title" className="ob-title">
          Welcome back{firstName ? `, ${firstName}` : ""}. Your profile is {percentDone}% done.
        </h1>
        <p className="ob-lede">The hard part is behind you. A few more taps and clients can start finding you.</p>
        <p className="ob-sub">
          Want to look over everything again?{" "}
          <button type="button" className="ob-link" onClick={onRestart}>
            Start from the beginning
          </button>{" "}
          Your answers stay filled in.
        </p>
      </header>
    );
  }
  return (
    <header className="ob-head ob-welcome">
      <span className="ob-badge" aria-hidden="true">
        <span className="ms">auto_awesome</span>
      </span>
      <h1 id="ob-title" className="ob-title">
        {name ? name.charAt(0).toUpperCase() + name.slice(1) : ""}
        {name ? "someone" : "Someone"} {city ? `in ${city}` : "near you"} is stuck on a problem you&apos;ve already
        solved.
      </h1>
      <p className="ob-lede">
        Your experience is worth paying for. Let&apos;s put it where the right people can find it, and book you.
      </p>
      <ul className="ob-points">
        <li>
          <span className="ms" aria-hidden="true">
            touch_app
          </span>
          <span>
            <strong>You won&apos;t face a blank page.</strong> We suggest the answers; you tap the ones that are true.
          </span>
        </li>
        <li>
          <span className="ms" aria-hidden="true">
            draw
          </span>
          <span>
            <strong>We write it, you sign it.</strong> Your profile is drafted from your answers, in your voice.
            Nothing goes out until you approve every line.
          </span>
        </li>
        <li>
          <span className="ms" aria-hidden="true">
            verified_user
          </span>
          <span>
            <strong>Five minutes, no risk.</strong> Saved after every tap, and our team reviews it before anyone
            sees it.
          </span>
        </li>
      </ul>
      <p className="ob-sub">
        Rather write every word yourself? <Link href="/expert/application/profile">Use the full form</Link>
      </p>
    </header>
  );
}

/** Only offered when the AI is answering: the fallback list never changes. */
function MoreButton({ chip, onClick }: { chip?: ChipState; onClick: () => void }) {
  if (!chip || chip.source !== "ai") return null;
  const loading = chip.loading;
  return (
    <button type="button" className="ob-more" onClick={onClick} disabled={loading}>
      <span className={loading ? "ms ob-spin" : "ms"} aria-hidden="true">
        refresh
      </span>
      {loading ? "Thinking…" : "Show me other ideas"}
    </button>
  );
}

const HIGHLIGHT_EXAMPLES = [
  "e.g. Grew yearly sales from 2M to 9M ETB in two years",
  "e.g. Opened 4 branches across Addis Ababa and Hawassa",
  "e.g. Trained 120 loan officers for a national bank",
];

/** Up to 3 achievements, written freely: no templates to fill in. */
function Highlights({ list, onChange }: { list: string[]; onChange: (next: string[]) => void }) {
  const rows = Array.from({ length: 3 }, (_, i) => list[i] ?? "");
  const update = (i: number, value: string) => {
    const next = rows.map((v, j) => (j === i ? value : v));
    // Keep the order typed, dropping empty boxes at the end only.
    while (next.length && !next[next.length - 1]) next.pop();
    onChange(next);
  };
  return (
    <>
      <ul className="ob-tips" aria-label="Ideas">
        <li>
          <span className="ms" aria-hidden="true">
            trending_up
          </span>
          A result with a number: how much, how many, how fast
        </li>
        <li>
          <span className="ms" aria-hidden="true">
            construction
          </span>
          Something you built, launched or turned around
        </li>
        <li>
          <span className="ms" aria-hidden="true">
            workspace_premium
          </span>
          An award, a big client, or a team you led
        </li>
      </ul>
      <ol className="ob-list ob-highlights">
        {rows.map((value, i) => (
          <li key={i}>
            <input
              className="input"
              value={value}
              maxLength={160}
              aria-label={`Achievement ${i + 1}`}
              placeholder={HIGHLIGHT_EXAMPLES[i]}
              onChange={(e) => update(i, e.target.value)}
            />
          </li>
        ))}
      </ol>
      {list.some(hasPlaceholder) ? (
        <p className="ob-hint">Some lines still have [brackets] from before. Write the real detail in their place.</p>
      ) : null}
    </>
  );
}

function Drafts({
  answers,
  drafting,
  source,
  editing,
  setEditing,
  onEdit,
  onApprove,
  onRegenerate,
}: {
  answers: OnboardingAnswers;
  drafting: DraftField | "all" | null;
  source: "ai" | "fallback" | null;
  editing: DraftField | null;
  setEditing: (field: DraftField | null) => void;
  onEdit: (field: DraftField, value: string) => void;
  onApprove: (field: DraftField) => void;
  onRegenerate: (field?: DraftField, tweak?: string) => void;
}) {
  if (drafting === "all") {
    return (
      <div className="ob-writing" role="status">
        <span className="ms ob-spin" aria-hidden="true">
          auto_awesome
        </span>
        <p>Writing your profile from your answers…</p>
        <span className="ob-skel-line" />
        <span className="ob-skel-line" />
        <span className="ob-skel-line short" />
      </div>
    );
  }

  const fields = DRAFT_FIELDS.filter((f) => f !== "career_highlights" || answers.drafts[f] || answers.highlights.length);

  return (
    <>
      <p className={source === "fallback" ? "ob-note" : "ob-note ai"}>
        <span className="ms" aria-hidden="true">
          {source === "fallback" ? "edit_note" : "auto_awesome"}
        </span>
        {source === "fallback"
          ? "Starter text from your answers. Edit it to sound like you."
          : "Written from your answers. Check every line: only you know it's true."}
      </p>
      {/* Rewriting needs the AI; the starter text would come back unchanged. */}
      {source !== "fallback" ? (
        <div className="ob-tones" role="group" aria-label="Rewrite everything">
          <span className="muted">Rewrite all:</span>
          {TONES.map((tone) => (
            <button key={tone.key} type="button" className="ob-chip sm" onClick={() => onRegenerate(undefined, tone.key)}>
              {tone.label}
            </button>
          ))}
        </div>
      ) : null}
      {fields.map((field) => {
        const approved = answers.approved.includes(field);
        const busy = drafting === field;
        return (
          <article key={field} className={approved ? "ob-draft ok" : "ob-draft"}>
            <header>
              <h2>{DRAFT_LABELS[field]}</h2>
              {approved ? (
                <span className="ob-ok ob-pop">
                  <span className="ms" aria-hidden="true">
                    check_circle
                  </span>
                  Approved
                </span>
              ) : null}
            </header>
            {busy ? (
              <div className="ob-writing sm" role="status">
                <span className="ob-skel-line" />
                <span className="ob-skel-line short" />
              </div>
            ) : editing === field ? (
              <textarea
                className="input"
                autoFocus
                rows={field === "headline" ? 2 : 6}
                maxLength={DRAFT_LIMITS[field]}
                value={answers.drafts[field]}
                aria-label={DRAFT_LABELS[field]}
                onChange={(e) => onEdit(field, e.target.value)}
              />
            ) : (
              <p className={answers.drafts[field] ? "ob-draft-text" : "ob-draft-text ob-ghost"}>
                {answers.drafts[field] || "Empty: tap Edit to write it"}
              </p>
            )}
            <div className="ob-draft-acts">
              {!approved && editing !== field ? (
                <button
                  type="button"
                  className="ob-chip sm on"
                  disabled={busy || !answers.drafts[field].trim()}
                  onClick={() => onApprove(field)}
                >
                  <span className="ms" aria-hidden="true">
                    thumb_up
                  </span>
                  Looks good
                </button>
              ) : null}
              <button
                type="button"
                className="ob-chip sm"
                disabled={busy}
                onClick={() => setEditing(editing === field ? null : field)}
              >
                <span className="ms" aria-hidden="true">
                  {editing === field ? "done" : "edit"}
                </span>
                {editing === field ? "Done" : "Edit"}
              </button>
              <button
                type="button"
                className="ob-chip sm"
                hidden={source === "fallback"}
                disabled={busy}
                onClick={() => onRegenerate(field)}
              >
                <span className="ms" aria-hidden="true">
                  refresh
                </span>
                Rewrite
              </button>
            </div>
          </article>
        );
      })}
    </>
  );
}

/** A compact chip with a tick box (square = pick several, round = pick
 * one), so it's obvious how many can be chosen. */
function TickChip({
  on,
  onClick,
  round = false,
  icon,
  children,
}: {
  on: boolean;
  onClick: () => void;
  round?: boolean;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={on ? "ob-chip ob-tickchip on" : "ob-chip ob-tickchip"} aria-pressed={on} onClick={onClick}>
      <span className={round ? "ob-tick round" : "ob-tick"} aria-hidden="true">
        <span className="ms">check</span>
      </span>
      {icon ? (
        <span className="ms" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

function Price({
  answers,
  pricing,
  onChange,
}: {
  answers: OnboardingAnswers;
  pricing: PlatformPricing;
  onChange: (patch: Partial<OnboardingAnswers>) => void;
}) {
  const price = Number(answers.price);
  const fee = formatVatRate(pricing.commissionRate);
  const vat = formatVatRate(pricing.vatRate);
  const toggleDuration = (d: SessionDuration) =>
    onChange({
      durations: answers.durations.includes(d) ? answers.durations.filter((x) => x !== d) : [...answers.durations, d].sort((a, b) => a - b),
    });

  // No suggested amounts: experts took a suggestion as "the" price. They
  // write their own, and see what the client pays and what they receive.
  return (
    <>
      <label className="ob-price-field">
        <span className="sr-only">Your price for 60 minutes, in ETB</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={50}
          className="num"
          autoFocus
          value={answers.price}
          placeholder="Your price"
          onChange={(e) => onChange({ price: e.target.value })}
        />
        <span className="ob-price-unit">ETB / 60 min</span>
      </label>
      <p className="ob-hint">Set what your hour is worth. There&apos;s no standard price, and you can change it any time.</p>
      {price > 0 ? (
        <dl className="ob-money" aria-live="polite">
          <div>
            <dt>Your price</dt>
            <dd className="num">{price.toLocaleString()} ETB</dd>
            <p>What you set for 60 minutes.</p>
          </div>
          <div>
            <dt>Client pays</dt>
            <dd className="num">{customerPrice(price, pricing.vatRate).toLocaleString()} ETB</dd>
            <p>
              Your price plus {vat} VAT. VAT is a government tax added on top for the client, so it doesn&apos;t come
              out of your price.
            </p>
          </div>
          <div className="ob-money-you">
            <dt>You receive</dt>
            <dd className="num">{expertPayout(price, pricing.commissionRate).toLocaleString()} ETB</dd>
            <p>
              Your price minus Pivotroom&apos;s {fee} service fee. This is <strong>before income tax</strong>, so what
              you take home will be a little less.
            </p>
          </div>
        </dl>
      ) : null}

      <p className="label ob-label">
        Session lengths you offer <span className="muted">(pick as many as you like)</span>
      </p>
      <div className="ob-chips" role="group" aria-label="Session lengths">
        {SESSION_DURATIONS.map((d) => (
          <TickChip key={d} on={answers.durations.includes(d)} onClick={() => toggleDuration(d)}>
            {d} min
          </TickChip>
        ))}
      </div>
      <p className="ob-hint">Other lengths are priced from your 60-minute price automatically.</p>

      <p className="label ob-label">
        How you meet clients <span className="muted">(one or both)</span>
      </p>
      <div className="ob-chips" role="group" aria-label="Session formats">
        <TickChip on={answers.online} onClick={() => onChange({ online: !answers.online })} icon="videocam">
          Online
        </TickChip>
        <TickChip on={answers.inPerson} onClick={() => onChange({ inPerson: !answers.inPerson })} icon="handshake">
          In person
        </TickChip>
      </div>

      <p className="label ob-label">
        How fast do you reply? <span className="muted">(optional)</span>
      </p>
      <div className="ob-chips" role="group" aria-label="Reply time">
        {RESPONSE_TIME_OPTIONS.map((option) => (
          <TickChip
            key={option.value}
            round
            on={answers.responseTime === option.value}
            onClick={() => onChange({ responseTime: answers.responseTime === option.value ? "" : option.value })}
          >
            {option.label}
          </TickChip>
        ))}
      </div>
    </>
  );
}

function Giving({
  answers,
  ngos,
  firstName,
  onChange,
}: {
  answers: OnboardingAnswers;
  ngos: { id: string; name: string }[];
  firstName: string;
  onChange: (patch: Partial<OnboardingAnswers>) => void;
}) {
  const ngoName = ngos.find((n) => n.id === answers.ngoId)?.name;
  // Once one is chosen, show only that one so the share choice sits right
  // under it instead of below the whole list.
  const [browsing, setBrowsing] = useState(!ngoName);
  const shown = browsing || !ngoName ? ngos : ngos.filter((ngo) => ngo.id === answers.ngoId);
  return (
    <>
      <div className="ob-chips" role="group" aria-label="Organisation">
        {!browsing && ngoName ? (
          <button type="button" className="ob-more" onClick={() => setBrowsing(true)}>
            <span className="ms" aria-hidden="true">
              swap_horiz
            </span>
            Choose a different one
          </button>
        ) : null}
        {shown.map((ngo) => (
          <button
            key={ngo.id}
            type="button"
            className={answers.ngoId === ngo.id ? "ob-chip on" : "ob-chip"}
            aria-pressed={answers.ngoId === ngo.id}
            onClick={() => {
              const picking = answers.ngoId !== ngo.id;
              onChange({ ngoId: picking ? ngo.id : "" });
              setBrowsing(!picking);
            }}
          >
            {ngo.name}
          </button>
        ))}
      </div>
      {ngoName ? (
        <>
          <p className="label ob-label">Share of your earnings (only you and our team see this)</p>
          <div className="ob-chips" role="group" aria-label="Share of earnings">
            {PERCENTS.map((p) => (
              <button
                key={p}
                type="button"
                className={answers.percent === p ? "ob-chip on" : "ob-chip"}
                aria-pressed={answers.percent === p}
                onClick={() => onChange({ percent: p })}
              >
                <span className="num">{p}%</span>
              </button>
            ))}
          </div>
          <div className="giving-box ob-pop" aria-live="polite">
            <span className="giving-icon" aria-hidden="true">
              <span className="ms">volunteer_activism</span>
            </span>
            <p>
              Part of {firstName ? `${firstName}'s` : "your"} earnings from Pivotroom sessions go to{" "}
              <strong>{ngoName}</strong>
            </p>
          </div>
        </>
      ) : null}
    </>
  );
}

function Submit({
  termsAccepted,
  onFix,
  mini,
}: {
  termsAccepted: boolean;
  onFix: (id: CardId) => void;
  mini: React.ReactNode;
}) {
  const [state, formAction, isPending] = useActionState<ExpertActionState, FormData>(submitApplicationAction, {});

  if (state.success) {
    return (
      <div className="ob-done" role="status">
        <Confetti />
        <span className="ob-badge big" aria-hidden="true">
          <span className="ms">celebration</span>
        </span>
        <h2 className="ob-title">You&apos;re in the review queue</h2>
        <p className="ob-sub">Our team reads every application, usually within 2 working days. We&apos;ll email you.</p>
        <div className="ob-done-acts">
          <Link href="/preview/my-profile?from=onboarding" className="btn btn-ink md">
            Preview your profile
          </Link>
          <Link href="/expert/application" className="btn btn-line md">
            Go to your application
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="ob-submit">
      {mini}
      <p className="ob-sub">
        Want to see the full page? <Link href="/preview/my-profile?from=onboarding">Preview your profile</Link>
      </p>
      {state.error ? (
        <div className="notice err" role="alert">
          {state.error}
          {state.missingFields?.length ? (
            <ul className="ob-missing">
              {state.missingFields.map((field) => (
                <li key={field}>
                  {field}
                  {FIX_CARD[field] ? (
                    <button type="button" className="ob-more" onClick={() => onFix(FIX_CARD[field])}>
                      Fix
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {termsAccepted ? null : (
        <label className="oq-tick ob-terms">
          <input type="checkbox" name="accept_terms" required />
          <span>
            I agree to the <Link href="/expert-terms">expert terms</Link>, and everything in my profile is true.
          </span>
        </label>
      )}
      <div className="ob-foot">
        <button type="submit" className="btn btn-ink md ob-go" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit for review"}
          <span className="ms" aria-hidden="true">
            send
          </span>
        </button>
      </div>
    </form>
  );
}
