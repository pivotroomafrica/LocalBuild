"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import "./onboarding.css";
import { ChipGroup } from "@/components/expert/onboarding/ChipGroup";
import { MiniProfile } from "@/components/expert/onboarding/MiniProfile";
import { Confetti } from "@/components/expert/onboarding/Confetti";
import { PhotoUpload } from "@/components/expert/PhotoUpload";
import { PHOTO_PREVIEW_EVENT } from "@/components/expert/LiveProfilePreview";
import { CountryCityFields } from "@/components/ui/CountryCityFields";
import {
  saveOnboardingAction,
  suggestPricesAction,
  type OnboardingSavePart,
} from "@/lib/expert/onboarding/actions";
import { submitApplicationAction, type ExpertActionState } from "@/lib/expert/actions";
import {
  DRAFT_FIELDS,
  DRAFT_LABELS,
  DRAFT_LIMITS,
  LANGUAGE_CHIPS,
  type ChipStep,
  type DraftField,
  type ExperienceRow,
  type OnboardingAnswers,
} from "@/lib/expert/onboarding/answers";
import { RESPONSE_TIME_OPTIONS } from "@/lib/expert/profileDetails";
import { customerPrice, expertPayout, type PlatformPricing } from "@/lib/pricing/platform";
import {
  EXPERT_EXPERIENCE_RANGES,
  EXPERT_EXPERIENCE_RANGE_LABELS,
  MAX_EXPERT_CATEGORIES,
  SESSION_DURATIONS,
  type SessionDuration,
} from "@/types/expert";

type CardId =
  | "welcome"
  | "field"
  | "role"
  | "years"
  | "problems"
  | "who"
  | "highlights"
  | "experience"
  | "location"
  | "drafts"
  | "photo"
  | "price"
  | "giving"
  | "submit";

type CardDef = { id: CardId; title: string; hint?: string; save?: OnboardingSavePart; chips?: ChipStep; optional?: boolean };

const CARDS: CardDef[] = [
  { id: "welcome", title: "Let's build your expert profile" },
  { id: "field", title: "Which areas do you advise on?", hint: "Pick up to 3. Clients browse by these.", save: "basics" },
  { id: "role", title: "What's your current role?", hint: "Suggested from your areas. Tap one or write your own.", save: "basics", chips: "role" },
  { id: "years", title: "How many years of experience do you have?", save: "basics" },
  { id: "problems", title: "What problems do clients bring you?", hint: "Tap the ones you're great at. Up to 6.", chips: "problems" },
  { id: "who", title: "Who do you help most?", hint: "Up to 4.", chips: "who" },
  {
    id: "highlights",
    title: "Anything you're proud of?",
    hint: "Optional. Tap a template, then fill in the [brackets] with your real numbers.",
    chips: "highlights",
    optional: true,
  },
  { id: "experience", title: "Your recent roles", hint: "Optional, up to 3. Clients like seeing the path.", chips: "titles", optional: true },
  { id: "location", title: "Where are you, and which languages do you speak?", save: "basics" },
  { id: "drafts", title: "Here's your profile, written from your answers", save: "drafts" },
  { id: "photo", title: "Add a clear photo of your face", hint: "Profiles with a real photo get booked far more often." },
  { id: "price", title: "Set your price", hint: "For 60 minutes, in ETB. You can change it any time.", save: "pricing" },
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
  "Years of experience": "years",
  "Short bio": "drafts",
  "Expertise summary": "drafts",
  "Problems you help with": "drafts",
  "Who you help": "drafts",
  Country: "location",
  City: "location",
  "Profile photo": "photo",
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
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1969 }, (_, i) => String(THIS_YEAR - i));

type ChipState = { key: string; options: string[]; source: "ai" | "fallback"; loading: boolean };

function chipKey(step: ChipStep, a: OnboardingAnswers) {
  const parts: Record<ChipStep, unknown[]> = {
    role: [a.categoryIds],
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
  const [prices, setPrices] = useState<{ prices: number[]; peers: number } | null>(null);
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
    const a = answersRef.current;
    if (target.id === "experience" && a.experience.length === 0 && a.role) {
      set({ experience: [{ title: a.role, organization: a.company, start_year: "", end_year: "" }] });
    }
    if (target.id === "drafts") {
      const empty = !Object.values(a.drafts).some(Boolean);
      const stale = draftedFrom.current !== draftInputsKey(a) && a.approved.length === 0;
      if (empty || stale) void generateDrafts();
    }
    if (target.id === "price" && !prices) {
      suggestPricesAction(a)
        .then(setPrices)
        .catch(() => setPrices({ prices: [1000, 1500, 2500], peers: 0 }));
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
    if (def.id === "experience") set({ experience: answersRef.current.experience.filter((row) => row.title.trim()) });
    // "Pick up where I left off" jumps to the furthest card reached.
    const resumeAt = def.id === "welcome" && answersRef.current.card > 1 ? answersRef.current.card : card + 1;
    const nextIndex = Math.min(resumeAt, CARDS.length - 1);
    set({ card: Math.max(answersRef.current.card, nextIndex) });

    // Start fetching the next card's suggestions while this one saves.
    const nextChips = CARDS[nextIndex].chips;
    if (nextChips) loadChips(nextChips);

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

  function canContinue(): boolean {
    const a = answers;
    switch (def.id) {
      case "field":
        return a.categoryIds.length > 0;
      case "role":
        return Boolean(a.role.trim());
      case "years":
        return Boolean(a.years);
      case "problems":
        return a.problems.length > 0;
      case "who":
        return a.who.length > 0;
      case "experience":
        return a.experience.every(
          (row) =>
            !row.title.trim() ||
            (row.start_year && (!row.end_year || Number(row.end_year) >= Number(row.start_year))),
        );
      case "location":
        return cityFilled;
      case "drafts":
        return drafting === null && REQUIRED_DRAFTS.every((field) => a.drafts[field].trim());
      case "photo":
        return Boolean(photoUrl);
      case "price":
        return Number(a.price) > 0 && a.durations.length > 0 && (a.online || a.inPerson);
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
    Boolean(photoUrl),
    Number(answers.price) > 0,
  ];
  const percentDone = Math.round((progressItems.filter(Boolean).length / progressItems.length) * 100);
  const isEmptyOptional =
    def.optional &&
    ((def.id === "highlights" && answers.highlights.length === 0) ||
      (def.id === "experience" && !answers.experience.some((row) => row.title.trim())) ||
      (def.id === "giving" && !answers.ngoId));

  const chipState = def.chips ? chips[def.chips] : undefined;

  return (
    <div className="ob">
      <div className="ob-top">
        <button
          type="button"
          className="ob-icon-btn"
          onClick={() => go(card - 1, "back")}
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
            <Welcome resuming={initial.card > 0} firstName={fullName.split(/\s+/)[0]} />
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

            {def.id === "role" ? (
              <>
                <ChipGroup
                  label="Current role"
                  options={chips.role?.options ?? []}
                  loading={chips.role?.loading}
                  selected={answers.role ? [answers.role] : []}
                  customPlaceholder="Your job title"
                  customMaxLength={120}
                  onChange={(picked) => set({ role: picked[0] ?? "" })}
                />
                <MoreButton chip={chips.role} onClick={() => loadChips("role", true)} />
                <div className="field ob-field">
                  <label className="label" htmlFor="ob-company">
                    Company or organisation <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="ob-company"
                    className="input"
                    maxLength={150}
                    value={answers.company}
                    onChange={(e) => set({ company: e.target.value })}
                    placeholder="e.g. Ethio Telecom, or Self-employed"
                  />
                </div>
              </>
            ) : null}

            {def.id === "years" ? (
              <ChipGroup
                label="Years of experience"
                options={EXPERT_EXPERIENCE_RANGES.map((r) => EXPERT_EXPERIENCE_RANGE_LABELS[r])}
                selected={answers.years ? [EXPERT_EXPERIENCE_RANGE_LABELS[answers.years]] : []}
                allowCustom={false}
                onChange={(picked) =>
                  set({ years: EXPERT_EXPERIENCE_RANGES.find((r) => EXPERT_EXPERIENCE_RANGE_LABELS[r] === picked[0]) ?? "" })
                }
              />
            ) : null}

            {def.id === "problems" || def.id === "who" ? (
              <>
                <ChipGroup
                  label={def.title}
                  options={chipState?.options ?? []}
                  loading={chipState?.loading}
                  selected={answers[def.id]}
                  max={def.id === "problems" ? 6 : 4}
                  customPlaceholder={def.id === "problems" ? "e.g. Getting a bank loan approved" : "e.g. Coffee exporters"}
                  onChange={(picked) => set(def.id === "problems" ? { problems: picked } : { who: picked })}
                />
                <MoreButton chip={chipState} onClick={() => loadChips(def.chips!, true)} />
              </>
            ) : null}

            {def.id === "highlights" ? (
              <Highlights
                answers={answers}
                chip={chips.highlights}
                onChange={(highlights) => set({ highlights })}
                onMore={() => loadChips("highlights", true)}
              />
            ) : null}

            {def.id === "experience" ? (
              <Experience
                rows={answers.experience}
                chip={chips.titles}
                onChange={(experience) => set({ experience })}
              />
            ) : null}

            {def.id === "location" ? (
              <>
                <div
                  ref={locationRef}
                  className="ob-field"
                  onInput={() => setCityFilled(Boolean(readLocation().city))}
                >
                  <CountryCityFields defaultCountry={answers.country || null} defaultCity={answers.city} required />
                </div>
                <p className="label ob-label">Languages you can hold a session in</p>
                <ChipGroup
                  label="Languages"
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
              <Price answers={answers} prices={prices} pricing={pricing} onChange={set} />
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
                    ? initial.card > 0
                      ? "Pick up where I left off"
                      : "Let's go"
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

function Welcome({ resuming, firstName }: { resuming: boolean; firstName: string }) {
  return (
    <header className="ob-head ob-welcome">
      <span className="ob-badge" aria-hidden="true">
        <span className="ms">auto_awesome</span>
      </span>
      <h1 id="ob-title" className="ob-title">
        {resuming ? `Welcome back${firstName ? `, ${firstName}` : ""}` : `Let's build your expert profile${firstName ? `, ${firstName}` : ""}`}
      </h1>
      <ul className="ob-points">
        <li>
          <span className="ms" aria-hidden="true">
            touch_app
          </span>
          Mostly taps. We suggest answers as you go.
        </li>
        <li>
          <span className="ms" aria-hidden="true">
            edit_note
          </span>
          AI writes your profile from your answers. You approve every word.
        </li>
        <li>
          <span className="ms" aria-hidden="true">
            schedule
          </span>
          About 5 minutes, saved after every step.
        </li>
      </ul>
      <p className="ob-sub">
        Prefer typing it all yourself? <Link href="/expert/application/profile">Use the full form</Link>
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

function Highlights({
  answers,
  chip,
  onChange,
  onMore,
}: {
  answers: OnboardingAnswers;
  chip?: ChipState;
  onChange: (next: string[]) => void;
  onMore: () => void;
}) {
  const list = answers.highlights;
  // The line just added from a template: focus it with its first
  // [bracket] selected, so typing replaces the placeholder.
  const [fresh, setFresh] = useState<number | null>(null);
  const selectBracket = (input: HTMLInputElement) => {
    const match = /\[[^\]]*\]/.exec(input.value);
    if (match) input.setSelectionRange(match.index, match.index + match[0].length);
  };
  return (
    <>
      <ChipGroup
        label="Achievement templates"
        options={(chip?.options ?? []).filter((o) => !list.includes(o))}
        loading={chip?.loading}
        selected={[]}
        max={1}
        customPlaceholder="Write an achievement"
        customMaxLength={160}
        onChange={(picked) => {
          if (picked[0] && list.length < 3) {
            setFresh(list.length);
            onChange([...list, picked[0]]);
          }
        }}
      />
      <MoreButton chip={chip} onClick={onMore} />
      {list.length ? (
        <ol className="ob-list">
          {list.map((item, i) => (
            <li key={i} className="ob-pop">
              <input
                className="input"
                value={item}
                maxLength={160}
                aria-label={`Achievement ${i + 1}`}
                ref={(input) => {
                  if (input && i === fresh) {
                    setFresh(null);
                    input.focus();
                    selectBracket(input);
                  }
                }}
                onKeyDown={(e) => {
                  // Tab from one [bracket] to the next.
                  if (e.key !== "Tab" || e.shiftKey) return;
                  const input = e.currentTarget;
                  const rest = input.value.slice(input.selectionEnd ?? 0);
                  const match = /\[[^\]]*\]/.exec(rest);
                  if (!match) return;
                  e.preventDefault();
                  const start = (input.selectionEnd ?? 0) + match.index;
                  input.setSelectionRange(start, start + match[0].length);
                }}
                onChange={(e) => onChange(list.map((v, j) => (j === i ? e.target.value : v)))}
              />
              <button
                type="button"
                className="ob-icon-btn"
                aria-label={`Remove achievement ${i + 1}`}
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                <span className="ms" aria-hidden="true">
                  close
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {list.some((item) => /\[[^\]]*\]/.test(item)) ? (
        <p className="ob-hint">Replace the [brackets] with your real numbers before you continue.</p>
      ) : null}
    </>
  );
}

function Experience({
  rows,
  chip,
  onChange,
}: {
  rows: ExperienceRow[];
  chip?: ChipState;
  onChange: (rows: ExperienceRow[]) => void;
}) {
  const update = (i: number, patch: Partial<ExperienceRow>) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const blank = { title: "", organization: "", start_year: "", end_year: "" };

  return (
    <>
      {rows.map((row, i) => (
        <div key={i} className="ob-role ob-pop">
          <div className="ob-role-row">
            <input
              className="input"
              placeholder="Role or title"
              aria-label={`Role ${i + 1} title`}
              maxLength={100}
              value={row.title}
              onChange={(e) => update(i, { title: e.target.value })}
            />
            <button
              type="button"
              className="ob-icon-btn"
              aria-label={`Remove role ${i + 1}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <span className="ms" aria-hidden="true">
                close
              </span>
            </button>
          </div>
          <input
            className="input"
            placeholder="Organisation"
            aria-label={`Role ${i + 1} organisation`}
            maxLength={120}
            value={row.organization}
            onChange={(e) => update(i, { organization: e.target.value })}
          />
          <div className="ob-role-years">
            <select
              className="input"
              aria-label={`Role ${i + 1} start year`}
              value={row.start_year}
              onChange={(e) => update(i, { start_year: e.target.value })}
            >
              <option value="">From…</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              className="input"
              aria-label={`Role ${i + 1} end year`}
              value={row.end_year}
              onChange={(e) => update(i, { end_year: e.target.value })}
            >
              <option value="">To now</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      {rows.length < 3 ? (
        <>
          <p className="label ob-label">{rows.length ? "Add another role" : "Add a role"}</p>
          <ChipGroup
            label="Suggested titles"
            options={chip?.options ?? []}
            loading={chip?.loading}
            selected={[]}
            max={1}
            customPlaceholder="Role or title"
            customMaxLength={100}
            onChange={(picked) => picked[0] && onChange([...rows, { ...blank, title: picked[0] }])}
          />
        </>
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

function Price({
  answers,
  prices,
  pricing,
  onChange,
}: {
  answers: OnboardingAnswers;
  prices: { prices: number[]; peers: number } | null;
  pricing: PlatformPricing;
  onChange: (patch: Partial<OnboardingAnswers>) => void;
}) {
  const price = Number(answers.price);
  const suggested = prices?.prices ?? [];
  const custom = answers.price !== "" && !suggested.includes(price);
  const toggleDuration = (d: SessionDuration) =>
    onChange({
      durations: answers.durations.includes(d) ? answers.durations.filter((x) => x !== d) : [...answers.durations, d].sort((a, b) => a - b),
    });

  return (
    <>
      <div className="ob-chips" role="group" aria-label="Price for 60 minutes" aria-busy={!prices || undefined}>
        {!prices
          ? Array.from({ length: 3 }, (_, i) => <span key={i} className="ob-chip ob-chip-skel big" aria-hidden="true" />)
          : suggested.map((p) => (
              <button
                key={p}
                type="button"
                className={price === p ? "ob-chip big on" : "ob-chip big"}
                aria-pressed={price === p}
                onClick={() => onChange({ price: String(p) })}
              >
                <span className="num">{p.toLocaleString()}</span> ETB
              </button>
            ))}
        <label className={custom ? "ob-chip big on ob-price-own" : "ob-chip big ob-price-own"}>
          <span className="muted">Other</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step={50}
            className="num"
            aria-label="Your own price in ETB"
            value={custom ? answers.price : ""}
            placeholder="0"
            onChange={(e) => onChange({ price: e.target.value })}
          />
        </label>
      </div>
      {prices ? (
        <p className="ob-hint">
          {prices.peers > 0
            ? `Based on ${prices.peers} experts in your areas on Pivotroom.`
            : "Typical starting prices for your experience."}
        </p>
      ) : null}
      {price > 0 ? (
        <p className="ob-note">
          Client pays <strong className="num">{customerPrice(price, pricing.vatRate).toLocaleString()} ETB</strong> · you
          receive <strong className="num">{expertPayout(price, pricing.commissionRate).toLocaleString()} ETB</strong>
        </p>
      ) : null}

      <p className="label ob-label">Session lengths you offer</p>
      <div className="ob-chips" role="group" aria-label="Session lengths">
        {SESSION_DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={answers.durations.includes(d) ? "ob-chip on" : "ob-chip"}
            aria-pressed={answers.durations.includes(d)}
            onClick={() => toggleDuration(d)}
          >
            {d} min
          </button>
        ))}
      </div>

      <p className="label ob-label">How you meet clients</p>
      <div className="ob-chips" role="group" aria-label="Session formats">
        <button
          type="button"
          className={answers.online ? "ob-chip on" : "ob-chip"}
          aria-pressed={answers.online}
          onClick={() => onChange({ online: !answers.online })}
        >
          <span className="ms" aria-hidden="true">
            videocam
          </span>
          Online
        </button>
        <button
          type="button"
          className={answers.inPerson ? "ob-chip on" : "ob-chip"}
          aria-pressed={answers.inPerson}
          onClick={() => onChange({ inPerson: !answers.inPerson })}
        >
          <span className="ms" aria-hidden="true">
            handshake
          </span>
          In person
        </button>
      </div>

      <p className="label ob-label">
        How fast do you reply? <span className="muted">(optional)</span>
      </p>
      <div className="ob-chips" role="group" aria-label="Reply time">
        {RESPONSE_TIME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={answers.responseTime === option.value ? "ob-chip on" : "ob-chip"}
            aria-pressed={answers.responseTime === option.value}
            onClick={() => onChange({ responseTime: answers.responseTime === option.value ? "" : option.value })}
          >
            {option.label}
          </button>
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
          <Link href="/preview/my-profile" className="btn btn-ink md">
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
        Want to see the full page? <Link href="/preview/my-profile">Preview your profile</Link>
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
