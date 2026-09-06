"use client";

import { useActionState } from "react";
import { runRlsCrossUserTest, type RlsTestState } from "./actions";

const initialState: RlsTestState = {};

function ResultLine({ label, pass }: { label: string; pass: boolean | undefined }) {
  if (pass === undefined) return null;
  return (
    <p className={`font-mono text-sm ${pass ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
      {label}: {pass ? "PASS" : "FAIL"}
    </p>
  );
}

export function RlsTestForm() {
  const [state, formAction, isPending] = useActionState(runRlsCrossUserTest, initialState);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="other_user_id" className="text-sm font-medium">
            Another customer&apos;s UUID (profiles.id)
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
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Running..." : "Run cross-user test"}
        </button>
      </form>

      {state.error ? (
        <p className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {state.error}
        </p>
      ) : null}

      {state.otherUserId ? (
        <div className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="mb-2 text-sm text-[var(--color-text-muted)]">
            Target: <span className="font-mono">{state.otherUserId}</span>
          </p>
          <ResultLine
            label="OTHER PROFILE READ BLOCKED"
            pass={state.otherProfileReadBlocked}
          />
          <ResultLine
            label="OTHER CUSTOMER_PROFILE READ BLOCKED"
            pass={state.otherCustomerProfileReadBlocked}
          />
          <ResultLine
            label="OTHER PROFILE UPDATE BLOCKED"
            pass={state.otherProfileUpdateBlocked}
          />
          <ResultLine
            label="OTHER CUSTOMER_PROFILE UPDATE BLOCKED"
            pass={state.otherCustomerProfileUpdateBlocked}
          />
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Rows returned/affected — profile read: {state.otherProfileRowsReturned}, customer_profile
            read: {state.otherCustomerProfileRowsReturned}, profile update:{" "}
            {state.otherProfileUpdateRowsAffected}, customer_profile update:{" "}
            {state.otherCustomerProfileUpdateRowsAffected}
          </p>
        </div>
      ) : null}
    </div>
  );
}
