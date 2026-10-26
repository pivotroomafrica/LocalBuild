"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitApplicationAction, type ExpertActionState } from "@/lib/expert/actions";

const initialState: ExpertActionState = {};

type Props = {
  canSubmit: boolean;
  /** Terms already accepted (stamped once by the database), so the
   * checkbox isn't asked again on a resubmission. */
  termsAccepted: boolean;
  /** Same action (submitApplicationAction handles both draft -> submitted
   * and changes_requested -> submitted), different label/copy depending
   * on which state the applicant is resubmitting from. */
  label?: string;
  successMessage?: string;
};

export function SubmitApplicationPanel({
  canSubmit,
  termsAccepted,
  label = "Submit for review",
  successMessage = "Application submitted. Our team reviews every expert, usually within 2 working days.",
}: Props) {
  const [state, formAction, isPending] = useActionState(submitApplicationAction, initialState);

  if (state.success) {
    return (
      <p className="notice" role="status" style={{ margin: 0 }}>
        {successMessage}
      </p>
    );
  }

  return (
    <form action={formAction} className="stack" style={{ gap: 14 }}>
      {state.error ? (
        <div className="notice err" role="alert">
          {state.error}
          {state.missingFields?.length ? (
            <ul style={{ margin: "8px 0 0", paddingInlineStart: 20 }}>
              {state.missingFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {termsAccepted ? null : (
        <label className="oq-tick" style={{ alignSelf: "flex-start", minHeight: 48 }}>
          <input type="checkbox" name="accept_terms" required />
          <span>
            I agree to the <Link href="/expert-terms">expert terms</Link>, and everything I&apos;ve written is true.
          </span>
        </label>
      )}

      <div className="oq-actions">
        <button type="submit" className="btn btn-ink md" disabled={!canSubmit || isPending}>
          {isPending ? "Submitting…" : label}
        </button>
      </div>
    </form>
  );
}
