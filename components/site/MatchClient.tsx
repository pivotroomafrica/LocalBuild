"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { matchExpertsAction, type MatchResult, type MatchState } from "@/lib/matching/actions";
import { formatEtb, initialsOf, summaryLine } from "@/components/site/format";

const initialState: MatchState = { status: "idle" };

const STEPS = ["Reading what you wrote", "Comparing it with each expert's actual experience", "Picking the ones best placed to help"];

/** The design's three-step progress while the match runs. The steps move
 * on a timer; the results replace them as soon as they arrive. */
function MatchingSteps() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timers = [900, 2200].map((ms, i) => setTimeout(() => setPhase(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div role="status" aria-live="polite" className="stack" style={{ gap: 14, marginBlockEnd: 32 }}>
      {STEPS.map((label, i) => (
        <div key={label} className={i < phase ? "mstep ok" : i === phase ? "mstep on" : "mstep"}>
          {i === phase ? (
            <span className="spin" aria-hidden="true" />
          ) : (
            <span className="ms" aria-hidden="true">
              {i < phase ? "check_circle" : "radio_button_unchecked"}
            </span>
          )}
          {label}
        </div>
      ))}
    </div>
  );
}

type Refine = "person" | "price" | "amharic";

const REFINE: { key: Refine; label: string; icon: string }[] = [
  { key: "person", label: "In person in Addis", icon: "location_on" },
  { key: "price", label: "Lowest price first", icon: "payments" },
  { key: "amharic", label: "Session in Amharic", icon: "translate" },
];

/** Re-rank (never drop) the matches by what the client ticked. */
function rerank(results: MatchResult[], on: Set<Refine>): MatchResult[] {
  let list = results.map((result, index) => ({ result, index }));
  const lift = (test: (r: MatchResult) => boolean) => {
    list = [...list.filter(({ result }) => test(result)), ...list.filter(({ result }) => !test(result))];
  };
  if (on.has("price")) {
    list = [...list].sort(
      (a, b) => (a.result.expert.startingPrice ?? Infinity) - (b.result.expert.startingPrice ?? Infinity) || a.index - b.index,
    );
  }
  if (on.has("amharic")) lift((r) => r.expert.languages.some((l) => l.toLowerCase() === "amharic"));
  if (on.has("person")) lift((r) => r.expert.inPersonEnabled);
  return list.map(({ result }) => result);
}

const MAX_CHARS = 1000;
const MIN_CHARS = 15;

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five"];

const RANK_TAGS = [
  { label: "Best match", dark: true },
  { label: "Strong match", dark: false },
  { label: "Also worth an hour", dark: false },
];

function MatchCard({ result, index, ranked }: { result: MatchResult; index: number; ranked: boolean }) {
  const { expert, reason } = result;
  const firstName = expert.fullName.split(/\s+/)[0] || expert.fullName;
  const tag = ranked ? (RANK_TAGS[index] ?? RANK_TAGS[2]) : { label: "Possible match", dark: false };
  const { stats } = expert;

  return (
    <article className={index === 0 && ranked ? "mc best" : "mc"} style={{ animationDelay: `${index * 90}ms` }}>
      <div className="side">
        <div className="portrait" aria-hidden="true">
          {expert.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, expires hourly.
            <img src={expert.photoUrl} alt="" />
          ) : (
            <span className="initials" style={{ fontSize: 32 }}>
              {initialsOf(expert.fullName)}
            </span>
          )}
        </div>
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span className={tag.dark ? "rtag dark" : "rtag"}>{tag.label}</span>
            {stats.isTopExpert ? <span className="rtag grey">Top expert</span> : null}
          </div>
          <h2 className="d" style={{ margin: "6px 0 0", fontSize: 22, lineHeight: 1.2 }}>
            {expert.fullName}
          </h2>
          <span className="muted" style={{ fontSize: 15, lineHeight: 1.4 }}>
            {summaryLine(expert)}
          </span>
          {stats.ratingAvg != null || expert.languages.length > 0 ? (
            <span className="muted num" style={{ fontSize: 14 }}>
              {stats.ratingAvg != null ? (
                <>
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" style={{ color: "#2b4fe0", verticalAlign: -2 }}>
                    <path
                      fill="currentColor"
                      d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                    />
                  </svg>{" "}
                  {stats.ratingAvg.toFixed(1)} ({stats.reviewCount})
                  {expert.languages.length > 0 ? " · " : ""}
                </>
              ) : null}
              {expert.languages.join(", ")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="why">
        <span className="why-h">
          <span className="ms" aria-hidden="true">
            auto_awesome
          </span>
          Why {firstName}
        </span>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{reason}</p>
      </div>
      <div className="mc-foot">
        <span className="num" style={{ fontWeight: 600 }}>
          {expert.startingPrice != null ? formatEtb(expert.startingPrice) : ""}
          {expert.startingDurationMinutes ? ` · ${expert.startingDurationMinutes} min` : ""}
        </span>
        <Link href={`/experts/${expert.slug}`} className="btn btn-ink md bk">
          Book {firstName}{" "}
          <span className="ms af" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </div>
    </article>
  );
}

/**
 * /match (website design, "Match results"). Describe a problem, get the
 * experts best placed to help with the reason for each (AI, or keyword
 * fallback -- lib/matching/actions.ts). Results open the real profiles,
 * where booking happens; nothing here books or charges anything.
 * `initialProblem` (from the home page or directory) is matched on load.
 */
export function MatchClient({ initialProblem }: { initialProblem: string }) {
  const [state, formAction, isPending] = useActionState(matchExpertsAction, initialState);
  const [problem, setProblem] = useState(initialProblem.slice(0, MAX_CHARS));
  const [editing, setEditing] = useState(initialProblem.trim().length < MIN_CHARS);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (autoSubmitted.current || initialProblem.trim().length < MIN_CHARS) return;
    autoSubmitted.current = true;
    formRef.current?.requestSubmit();
  }, [initialProblem]);

  const [lastHandled, setLastHandled] = useState<MatchState | null>(null);
  if (state !== lastHandled && state.status !== "idle") {
    setLastHandled(state);
    setEditing(state.status === "error");
  }

  const [refine, setRefine] = useState<Set<Refine>>(new Set());
  const results = rerank(state.status === "done" ? (state.results ?? []) : [], refine);
  const ranked = state.mode === "ai";
  const brief = state.problem ?? problem;

  return (
    <>
      <section style={{ background: "#f4f5f7", borderBottom: "1px solid #e4e6e9" }}>
        <div className="wrap stack" style={{ maxWidth: 1280, paddingBlock: "clamp(32px, 5vw, 56px)", gap: 20 }}>
          <span className="muted" style={{ fontSize: 14 }}>
            {state.status === "idle" && !isPending ? "Get matched" : "Your matches"}
          </span>

          <form
            ref={formRef}
            action={formAction}
            className="stack"
            style={{ gap: 12, maxWidth: 760, display: editing || isPending || state.status === "idle" ? undefined : "none" }}
          >
            {state.status === "idle" && !isPending ? (
              <h1 className="h1" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>
                What are you facing?
              </h1>
            ) : null}
            <label htmlFor="m-brief" className="sr">
              What you&apos;re facing
            </label>
            <textarea
              id="m-brief"
              name="problem"
              className="input"
              rows={4}
              required
              minLength={MIN_CHARS}
              maxLength={MAX_CHARS}
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              placeholder="Describe your problem or your plan in a few lines. We read it against each expert's actual experience."
              style={{ background: "#ffffff", borderColor: "#e4e6e9" }}
            />
            {/* Honeypot for bots; hidden from people and assistive tech. */}
            <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" hidden />
            <span className="muted num" style={{ fontSize: 13 }}>
              {problem.length}/{MAX_CHARS} · Please don&apos;t include passwords or ID numbers.
            </span>
            {state.status === "error" ? (
              <p role="alert" className="notice err" style={{ margin: 0 }}>
                {state.error}
              </p>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="submit" className="btn btn-ink md" disabled={isPending}>
                {isPending ? "Matching…" : state.status === "idle" ? "Find my match" : "Match me again"}
                {isPending ? null : (
                  <span className="ms af" aria-hidden="true">
                    arrow_forward
                  </span>
                )}
              </button>
              {state.status === "done" && editing && !isPending ? (
                <button type="button" className="btn btn-line md even" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          {!editing && !isPending && state.status === "done" ? (
            <div className="briefrow">
              <blockquote style={{ margin: 0, maxWidth: "72ch", fontSize: "clamp(17px, 1.6vw, 20px)", lineHeight: 1.5 }}>
                &ldquo;{brief}&rdquo;
              </blockquote>
              <button type="button" className="btn btn-line even" style={{ flex: "none" }} onClick={() => setEditing(true)}>
                <span className="ms" aria-hidden="true">
                  edit
                </span>
                Edit what I wrote
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {isPending ? (
        <section className="wrap" style={{ maxWidth: 1280, paddingBlock: "clamp(40px, 6vw, 72px) 120px" }}>
          <MatchingSteps />
          <div className="mgrid" aria-hidden="true">
            <div className="skel" />
            <div className="skel" />
            <div className="skel" />
          </div>
        </section>
      ) : state.status === "done" ? (
        <section
          className="wrap stack"
          style={{ maxWidth: 1280, paddingBlock: "clamp(40px, 5vw, 64px) clamp(64px, 8vw, 112px)", gap: 32 }}
          aria-live="polite"
        >
          {results.length > 0 ? (
            <>
              <div className="stack" style={{ gap: 8 }}>
                <h1 className="d" style={{ margin: 0, fontSize: "clamp(30px, 4vw, 48px)", lineHeight: 1.06, letterSpacing: "-0.025em" }}>
                  {ranked
                    ? `${NUMBER_WORDS[results.length] ?? results.length} ${results.length === 1 ? "person who fits" : "people who fit"} what you're facing.`
                    : `${NUMBER_WORDS[results.length] ?? results.length} ${results.length === 1 ? "expert" : "experts"} worth a look.`}
                </h1>
                <p className="muted" style={{ margin: 0, maxWidth: "60ch" }}>
                  {ranked
                    ? "We read what you wrote against what each expert has actually done, not their job titles. Here is who fits, and why."
                    : state.notice}
                  {refine.size > 0
                    ? ` Re-ranked for: ${REFINE.filter((item) => refine.has(item.key))
                        .map((item) => item.label.toLowerCase())
                        .join(", ")}.`
                    : ""}
                </p>
              </div>
              <div className="mgrid">
                {results.map((result, index) => (
                  <MatchCard key={result.expert.slug} result={result} index={index} ranked={ranked} />
                ))}
              </div>
              <div className="pcard stack" style={{ gap: 16 }}>
                <div className="stack" style={{ gap: 4 }}>
                  <h2 className="d" style={{ margin: 0, fontSize: 22 }}>
                    Not quite right?
                  </h2>
                  <span className="muted">Tell us what matters and we&apos;ll re-rank.</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {REFINE.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="rf"
                      aria-pressed={refine.has(item.key)}
                      onClick={() =>
                        setRefine((current) => {
                          const next = new Set(current);
                          if (next.has(item.key)) next.delete(item.key);
                          else next.add(item.key);
                          return next;
                        })
                      }
                    >
                      <span className="ms" aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 15, fontWeight: 500 }}>
                  <Link href="/experts" className="link-arrow" style={{ minHeight: 44 }}>
                    Browse every expert{" "}
                    <span className="ms af" aria-hidden="true">
                      arrow_forward
                    </span>
                  </Link>
                  <button type="button" className="textbtn" style={{ minHeight: 44, fontWeight: 500 }} onClick={() => setEditing(true)}>
                    Add more detail to what I wrote
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="pcard stack" style={{ maxWidth: 720, gap: 20 }}>
              <span className="circle-icon" aria-hidden="true">
                <span className="ms" style={{ fontSize: 28 }}>
                  person_search
                </span>
              </span>
              <h1 className="d" style={{ margin: 0, fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.08, letterSpacing: "-0.02em" }}>
                We don&apos;t have the right person for this yet.
              </h1>
              <p className="muted" style={{ margin: 0, maxWidth: "56ch" }}>
                We would rather tell you than book you an hour with someone who has only read about it. Tell us what
                you need and we&apos;ll look for an expert who has done exactly this.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <Link href="/contact" className="btn btn-ink md">
                  Ask us to find someone{" "}
                  <span className="ms af" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
                <button type="button" className="btn btn-line md even" onClick={() => setEditing(true)}>
                  Rewrite what I need
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <div style={{ height: 80 }} />
      )}
    </>
  );
}
