"use client";

import { useActionState } from "react";
import { submitApplicationAction, type ExpertActionState } from "@/lib/expert/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: ExpertActionState = {};

type Props = {
  canSubmit: boolean;
  /** Same action (submitApplicationAction handles both draft -> submitted
   * and changes_requested -> submitted), different label/copy depending
   * on which state the applicant is resubmitting from. */
  label?: string;
  successMessage?: string;
};

export function SubmitApplicationPanel({
  canSubmit,
  label = "Submit Application",
  successMessage = "Application submitted. Your application is now ready for review.",
}: Props) {
  const [state, formAction, isPending] = useActionState(submitApplicationAction, initialState);

  if (state.success) {
    return <FormMessage variant="success">{successMessage}</FormMessage>;
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
        {label}
      </Button>
    </form>
  );
}
