"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { matchExpertsAction, type MatchState } from "@/lib/matching/actions";
import { ExpertTile } from "@/components/site/ExpertTile";

const initialState: MatchState = { status: "idle" };

const MAX_CHARS = 1000;

const EXAMPLES = [
  "I own a furniture business in Addis Ababa and want to improve distribution and increase sales.",
  "We're a seed-stage startup preparing to raise our first investment round.",
  "I was just promoted to manage a team of 12 and want to become a better leader.",
];

/**
 * /match -- describe a problem in plain language, get up to five relevant
 * experts with a short reason each. Results link to the real profiles,
 * where booking happens; nothing here books or charges anything.
 */
export function MatchClient() {
  const [state, formAction, isPending] = useActionState(matchExpertsAction, initialState);
  const [problem, setProblem] = useState("");

  return (
    <div className="experts-directory-main">
      <section className="experts-page-hero">
        <div className="experts-hero-tag">
          <span>✦</span> AI EXPERT MATCHING
        </div>
        <h1 className="experts-hero-title">Tell us what you&apos;re working on</h1>
        <p className="experts-hero-subtitle">
          Describe your challenge in your own words and we&apos;ll suggest the experts on Pivotroom best placed to
          help.
        </p>
      </section>

      <form action={formAction} className="mx-auto mb-12 flex w-full max-w-3xl flex-col gap-3 px-4">
        <label htmlFor="problem" className="sr-only">
          Describe your problem
        </label>
        <textarea
          id="problem"
          name="problem"
          required
          minLength={15}
          maxLength={MAX_CHARS}
          rows={5}
          value={problem}
          onChange={(event) => setProblem(event.target.value)}
          placeholder="e.g. I run a small coffee export business and want to reach buyers in Europe..."
          className="w-full rounded-[20px] border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-[15px] leading-relaxed text-[var(--color-text)] shadow-[var(--shadow-card)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(37,99,235,0.14)]"
        />
        {/* Honeypot for bots; hidden from people and assistive tech. */}
        <input type="text" name="company_website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-[var(--color-text-muted)]">
            {problem.length}/{MAX_CHARS} · Please don&apos;t include passwords or personal ID numbers.
          </span>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-brand)] px-7 py-3 text-sm font-bold text-white shadow-[0_4px_14px_rgba(20,19,24,0.18)] transition-colors hover:bg-[var(--color-brand-hover)] disabled:opacity-60"
          >
            {isPending ? "Finding experts…" : "Find my experts"}
          </button>
        </div>

        {problem.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setProblem(example)}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}

        {state.status === "error" ? (
          <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
            {state.error}
          </p>
        ) : null}
      </form>

      {state.status === "done" ? (
        <section className="experts-section" aria-live="polite">
          <div className="experts-container">
            {state.notice ? (
              <p className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-text)]">
                {state.notice}
              </p>
            ) : null}

            {state.results && state.results.length > 0 ? (
              <>
                <h2 className="mb-6 text-xl font-extrabold tracking-[-0.02em] text-[var(--color-text)]">
                  {state.mode === "ai" ? "Your best matches" : "Experts that may fit"}
                </h2>
                <div className="experts-grid">
                  {state.results.map(({ expert, reason }) => (
                    <div key={expert.slug} className="flex flex-col gap-3">
                      <ExpertTile expert={expert} />
                      <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--color-text)]">
                        <span className="font-bold">Why: </span>
                        {reason}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-[15px] font-semibold text-[var(--color-text)]">
                  We couldn&apos;t find a clear match for that yet.
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Try adding more detail, or{" "}
                  <Link href="/experts" className="font-semibold text-[var(--color-accent)] hover:underline">
                    browse all experts
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
