"use client";

import { useActionState } from "react";
import {
  adminSaveExpertProfileAction,
  adminSetExpertVisibilityAction,
  type AdminActionState,
} from "@/lib/admin/actions";
import { ExpertiseQuestions, IdentityQuestions } from "@/components/expert/OnboardingFields";
import { HIDEABLE_FIELDS } from "@/lib/expert/profileFields";
import { RESPONSE_TIME_OPTIONS } from "@/lib/expert/profileDetails";
import type { ExpertCategory, ExpertProfile } from "@/types/expert";

const initialState: AdminActionState = {};

function Result({ state, saved }: { state: AdminActionState; saved: string }) {
  if (state.error) return <p className="notice err" role="alert">{state.error}</p>;
  if (state.success) return <p className="notice" role="status">{saved}</p>;
  return null;
}

/** Admin edit of every detail the expert gave during onboarding. */
export function AdminExpertProfileEditor({
  profile,
  fullName,
  categories,
  selectedCategoryIds,
}: {
  profile: ExpertProfile;
  fullName: string;
  categories: ExpertCategory[];
  selectedCategoryIds: string[];
}) {
  const [state, formAction, isPending] = useActionState(adminSaveExpertProfileAction, initialState);
  return (
    <form action={formAction} className="oq-form">
      <input type="hidden" name="expert_profile_id" value={profile.id} />
      <IdentityQuestions profile={profile} fullName={fullName} startAt={1} />
      <ExpertiseQuestions profile={profile} categories={categories} selectedCategoryIds={selectedCategoryIds} startAt={8} />
      <div className="oq">
        <div className="oq-head">
          <span className="oq-n num" aria-hidden="true">
            15
          </span>
          <label htmlFor="q-response" className="oq-label">
            Reply time
          </label>
        </div>
        <select id="q-response" name="response_time" className="input" defaultValue={profile.response_time ?? ""}>
          <option value="">Not stated</option>
          {RESPONSE_TIME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <Result state={state} saved="Saved. A published profile shows the changes straight away." />
      <div className="oq-actions">
        <button type="submit" className="btn btn-ink md" disabled={isPending}>
          {isPending ? "Saving…" : "Save profile details"}
        </button>
      </div>
    </form>
  );
}

/** Which details clients can see. Ticked = shown on the public profile. */
export function AdminExpertVisibilityForm({
  expertProfileId,
  hiddenFields,
}: {
  expertProfileId: string;
  hiddenFields: string[];
}) {
  const [state, formAction, isPending] = useActionState(adminSetExpertVisibilityAction, initialState);
  return (
    <form action={formAction} className="stack" style={{ gap: 14 }}>
      <input type="hidden" name="expert_profile_id" value={expertProfileId} />
      <div className="vis-grid" role="group" aria-label="Shown on the public profile">
        {HIDEABLE_FIELDS.map((field) => (
          <label key={field.key} className="oq-tick">
            <input type="checkbox" name="shown" value={field.key} defaultChecked={!hiddenFields.includes(field.key)} />
            {field.label}
          </label>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        Name, headline, areas, session prices and booking are always shown.
      </p>
      <Result state={state} saved="Visibility saved." />
      <div className="oq-actions">
        <button type="submit" className="btn btn-ink md" disabled={isPending}>
          {isPending ? "Saving…" : "Save visibility"}
        </button>
      </div>
    </form>
  );
}
