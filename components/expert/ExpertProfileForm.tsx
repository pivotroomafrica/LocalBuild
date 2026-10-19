"use client";

import { useActionState } from "react";
import { updateExpertProfileAction, type ExpertActionState } from "@/lib/expert/actions";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { TextareaField } from "@/components/ui/TextareaField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { ExperienceEditor } from "@/components/expert/ExperienceEditor";
import { RESPONSE_TIME_OPTIONS } from "@/lib/expert/profileDetails";
import {
  EXPERT_EXPERIENCE_RANGE_LABELS,
  EXPERT_EXPERIENCE_RANGES,
  type ExpertProfile,
} from "@/types/expert";

const initialState: ExpertActionState = {};

export function ExpertProfileForm({ expertProfile }: { expertProfile: ExpertProfile }) {
  const [state, formAction, isPending] = useActionState(updateExpertProfileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Professional Identity</h2>

        <TextField
          label="Professional Headline"
          name="headline"
          type="text"
          defaultValue={expertProfile.headline ?? ""}
          placeholder="Former Founder & B2B Growth Operator"
          maxLength={160}
        />
        <TextField
          label="Current Position"
          name="current_position"
          type="text"
          defaultValue={expertProfile.current_position ?? ""}
          placeholder="Chief Executive Officer"
          maxLength={120}
        />
        <TextField
          label="Current Company / Organization"
          name="current_company"
          type="text"
          defaultValue={expertProfile.current_company ?? ""}
          maxLength={150}
        />
        <SelectField
          label="Years of Professional Experience"
          name="years_experience_range"
          defaultValue={expertProfile.years_experience_range ?? ""}
          options={EXPERT_EXPERIENCE_RANGES.map((value) => ({
            value,
            label: EXPERT_EXPERIENCE_RANGE_LABELS[value],
          }))}
        />
        <TextField
          label="LinkedIn"
          name="linkedin_url"
          type="url"
          defaultValue={expertProfile.linkedin_url ?? ""}
          placeholder="https://www.linkedin.com/in/yourname"
          maxLength={300}
          hint="Strongly encouraged, though not required to submit."
        />
        <TextField
          label="Country"
          name="country"
          type="text"
          defaultValue={expertProfile.country ?? "Ethiopia"}
          maxLength={100}
        />
        <TextField
          label="City"
          name="city"
          type="text"
          defaultValue={expertProfile.city ?? ""}
          maxLength={100}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">About Your Experience</h2>

        <TextareaField
          label="Short Bio"
          name="short_bio"
          defaultValue={expertProfile.short_bio ?? ""}
          maxLength={1500}
          hint="Summarize your experience, credibility, and background. This will become your public profile copy."
        />
        <TextareaField
          label="Expertise Summary"
          name="expertise_summary"
          defaultValue={expertProfile.expertise_summary ?? ""}
          maxLength={1500}
          hint="What are you especially qualified to advise people on?"
        />
        <TextareaField
          label="Problems You Help With"
          name="problems_help_with"
          defaultValue={expertProfile.problems_help_with ?? ""}
          maxLength={1500}
          hint="What kinds of problems can someone bring to you?"
        />
        <TextareaField
          label="Who You Help"
          name="who_i_help"
          defaultValue={expertProfile.who_i_help ?? ""}
          maxLength={1000}
          hint="Who would benefit most from speaking with you?"
        />
        <TextareaField
          label="Career Highlights"
          name="career_highlights"
          defaultValue={expertProfile.career_highlights ?? ""}
          maxLength={1500}
          placeholder='Optional. A few concrete highlights, e.g. "Built and led...", "Served 150+ corporate clients..."'
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Languages, Replies and Experience</h2>

        <TextField
          label="Session Languages"
          name="languages"
          defaultValue={(expertProfile.languages ?? []).join(", ")}
          maxLength={200}
          placeholder="e.g. Amharic, English"
          hint="Separate languages with commas. Shown on your profile."
        />
        <SelectField
          label="How Quickly You Reply"
          name="response_time"
          defaultValue={expertProfile.response_time ?? ""}
          options={RESPONSE_TIME_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <ExperienceEditor initial={expertProfile.experience} />
      </section>

      <Button type="submit" isLoading={isPending} loadingText="Saving...">
        Save &amp; Continue
      </Button>
    </form>
  );
}
