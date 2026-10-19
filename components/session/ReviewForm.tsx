"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { submitReviewAction, type ReviewActionState } from "@/lib/reviews/actions";

const initialState: ReviewActionState = {};
const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/** Leave a review (website design, simplified to what the schema holds:
 * a 1-5 rating and the text shown on the expert's profile). */
export function ReviewForm({
  bookingReference,
  expertName,
  expertSlug,
}: {
  bookingReference: string;
  expertName: string;
  expertSlug: string | null;
}) {
  const [state, formAction, isPending] = useActionState(submitReviewAction, initialState);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const firstName = expertName.split(/\s+/)[0] || expertName;

  if (state.success) {
    return (
      <div className="stack" style={{ gap: 20 }}>
        <span className="circle-icon" aria-hidden="true">
          <span className="ms" style={{ fontSize: 28 }}>
            check
          </span>
        </span>
        <h1 className="d" style={{ margin: 0, fontSize: "clamp(28px, 3.4vw, 40px)", lineHeight: 1.08 }}>
          Thank you.
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Your review is on {firstName}&apos;s profile, where everyone weighing whether to book them can read it.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {expertSlug ? (
            <Link href={`/experts/${expertSlug}`} className="btn btn-ink md">
              Book {firstName} again{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          ) : null}
          <Link href="/dashboard/sessions" className="btn btn-line md even">
            Back to your sessions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="stack" style={{ gap: 28 }}>
      <input type="hidden" name="booking_reference" value={bookingReference} />
      <input type="hidden" name="rating" value={rating || ""} />
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="d" style={{ margin: 0, fontSize: "clamp(28px, 3.4vw, 40px)", lineHeight: 1.08 }}>
          How was your session with {firstName}?
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          The next person deciding whether to book {firstName} will read what you write. Two specific sentences help
          them more than ten kind ones.
        </p>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <span id="q-rate" className="label">
          Overall
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="rate" role="radiogroup" aria-labelledby="q-rate">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} out of 5`}
                className={n <= rating ? "on" : undefined}
                onClick={() => setRating(n)}
              >
                <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                  />
                </svg>
              </button>
            ))}
          </div>
          <span className="muted" aria-live="polite">
            {RATING_WORDS[rating]}
          </span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="r-text">Your review</label>
        <textarea
          id="r-text"
          name="body"
          className="input"
          rows={5}
          minLength={10}
          maxLength={1000}
          required
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={`What did ${firstName} help you decide or do?`}
        />
        <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span>Shown on {firstName}&apos;s profile with your first name and last initial.</span>
          <span className="num">{body.length}/1000</span>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="notice err" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href={`/dashboard/sessions/${bookingReference}`}>Not now</Link>
        <button type="submit" className="btn btn-ink md" disabled={isPending || rating === 0}>
          {isPending ? "Posting…" : "Post review"}
          {isPending ? null : (
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          )}
        </button>
      </div>
    </form>
  );
}
