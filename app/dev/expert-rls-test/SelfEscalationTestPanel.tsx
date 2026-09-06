"use client";

import { useActionState } from "react";
import { runSelfEscalationTest, type SelfEscalationTestState } from "./actions";

const initialState: SelfEscalationTestState = {};

function ResultLine({ label, pass }: { label: string; pass: boolean | undefined }) {
  if (pass === undefined) return null;
  return (
    <p className={`font-mono text-sm ${pass ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
      {label}: {pass ? "PASS" : "FAIL"}
    </p>
  );
}

export function SelfEscalationTestPanel() {
  const [state, formAction, isPending] = useActionState(runSelfEscalationTest, initialState);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Running..." : "Run self-escalation test"}
        </button>
      </form>

      {state.error ? (
        <p className="rounded-md bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {state.error}
        </p>
      ) : null}

      {state.selfApprovalBlocked !== undefined ? (
        <div className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <ResultLine label="SELF APPROVAL BLOCKED" pass={state.selfApprovalBlocked} />
          <ResultLine label="SELF PUBLISH BLOCKED" pass={state.selfPublishBlocked} />
          <ResultLine label="SELF ROLE ESCALATION BLOCKED" pass={state.selfRoleEscalationBlocked} />
        </div>
      ) : null}
    </div>
  );
}
