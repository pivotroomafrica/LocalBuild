"use client";

import { useActionState } from "react";
import { runCrossApplicantTest, type CrossApplicantTestState } from "./actions";

const initialState: CrossApplicantTestState = {};

function ResultLine({ label, pass }: { label: string; pass: boolean | undefined }) {
  if (pass === undefined) return null;
  return (
    <p className={`font-mono text-sm ${pass ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
      {label}: {pass ? "PASS" : "FAIL"}
    </p>
  );
}

export function CrossApplicantTestForm() {
  const [state, formAction, isPending] = useActionState(runCrossApplicantTest, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="other_user_id" className="text-sm font-medium">
            Other applicant&apos;s user ID (profiles.id / auth.users.id)
          </label>
          <input
            id="other_user_id"
            name="other_user_id"
            type="text"
            placeholder="11111111-1111-1111-1111-111111111111"
            required
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 font-mono text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="other_expert_profile_id" className="text-sm font-medium">
            Other applicant&apos;s expert_profiles.id
          </label>
          <input
            id="other_expert_profile_id"
            name="other_expert_profile_id"
            type="text"
            placeholder="22222222-2222-2222-2222-222222222222"
            required
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 font-mono text-sm"
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            Find both in the Supabase dashboard Table Editor (profiles / expert_profiles).
            Give the target applicant at least one session offering for a meaningful result.
          </p>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Running..." : "Run cross-applicant test"}
        </button>
      </form>

      {state.error ? (
        <p className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {state.error}
        </p>
      ) : null}

      {state.otherProfileReadBlocked !== undefined ? (
        <div className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <ResultLine label="OTHER EXPERT PROFILE READ BLOCKED" pass={state.otherProfileReadBlocked} />
          <ResultLine label="OTHER EXPERT PROFILE UPDATE BLOCKED" pass={state.otherProfileUpdateBlocked} />
          <ResultLine
            label="OTHER CATEGORY RELATIONSHIP UPDATE BLOCKED"
            pass={state.otherCategoryInsertBlocked}
          />
          <ResultLine label="OTHER SESSION OFFERING UPDATE BLOCKED" pass={state.otherSessionUpdateBlocked} />
        </div>
      ) : null}
    </div>
  );
}
