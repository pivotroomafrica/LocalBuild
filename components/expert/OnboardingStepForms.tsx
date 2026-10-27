"use client";

import { useActionState } from "react";
import {
  saveOnboardingExpertiseAction,
  saveOnboardingIdentityAction,
  type ExpertActionState,
} from "@/lib/expert/actions";
import { ExpertiseQuestions, IdentityQuestions } from "@/components/expert/OnboardingFields";
import type { ExpertCategory, ExpertProfile } from "@/types/expert";

const initialState: ExpertActionState = {};

function StepButtons({ isPending, next }: { isPending: boolean; next: string }) {
  return (
    <div className="oq-actions">
      <button type="submit" name="intent" value="next" className="btn btn-ink md" disabled={isPending}>
        {isPending ? "Saving…" : `Save and continue to ${next}`}
      </button>
      <button type="submit" name="intent" value="stay" className="btn btn-line md" disabled={isPending}>
        Save for later
      </button>
    </div>
  );
}

/** Onboarding step 1, "Who you are". */
export function IdentityStepForm({
  profile,
  fullName,
  saved,
}: {
  profile: ExpertProfile;
  fullName: string;
  saved: boolean;
}) {
  const [state, formAction, isPending] = useActionState(saveOnboardingIdentityAction, initialState);
  return (
    <form action={formAction} className="oq-form">
      {state.error ? <p className="notice err" role="alert">{state.error}</p> : null}
      {saved && !state.error ? <p className="notice" role="status">Saved. You can come back to this any time.</p> : null}
      <IdentityQuestions profile={profile} fullName={fullName} startAt={2} />
      <StepButtons isPending={isPending} next="step 2" />
    </form>
  );
}

/** Onboarding step 2, "What you've solved". */
export function ExpertiseStepForm({
  profile,
  categories,
  selectedCategoryIds,
  saved,
}: {
  profile: ExpertProfile;
  categories: ExpertCategory[];
  selectedCategoryIds: string[];
  saved: boolean;
}) {
  const [state, formAction, isPending] = useActionState(saveOnboardingExpertiseAction, initialState);
  return (
    <form action={formAction} className="oq-form">
      {state.error ? <p className="notice err" role="alert">{state.error}</p> : null}
      {saved && !state.error ? <p className="notice" role="status">Saved. You can come back to this any time.</p> : null}
      <ExpertiseQuestions profile={profile} categories={categories} selectedCategoryIds={selectedCategoryIds} startAt={9} />
      <StepButtons isPending={isPending} next="step 3" />
    </form>
  );
}
