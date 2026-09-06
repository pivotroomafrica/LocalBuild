"use client";

import { useActionState } from "react";
import { submitApplicationAction, type ExpertActionState } from "@/lib/expert/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: ExpertActionState = {};

export function SubmitApplicationPanel({ canSubmit }: { canSubmit: boolean }) {
  const [state, formAction, isPending] = useActionState(submitApplicationAction, initialState);

  if (state.success) {
    return (
      <FormMessage variant="success">
        Application submitted. Your application is now ready for review.
      </FormMessage>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? (
        <FormMessage variant="error">
          {state.error}
          {state.missingFields?.length ? (
            <ul className="mt-2 list-disc pl-5">
              {state.missingFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          ) : null}
        </FormMessage>
      ) : null}

      <Button type="submit" isLoading={isPending} loadingText="Submitting..." disabled={!canSubmit}>
        Submit Application
      </Button>
    </form>
  );
}
