"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileActionState } from "@/lib/profile/actions";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import {
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  EXPERIENCE_RANGE_LABELS,
  EXPERIENCE_RANGES,
  type CustomerProfile,
  type Industry,
  type Profile,
} from "@/types/profile";

const initialState: ProfileActionState = {};

type Props = {
  email: string;
  profile: Profile;
  customerProfile: CustomerProfile | null;
  industries: Industry[];
};

export function ProfileForm({ email, profile, customerProfile, industries }: Props) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">Profile</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Manage your personal details and professional background.
        </p>
      </div>

      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage variant="success">Profile updated successfully.</FormMessage> : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Personal Information</h2>

        <TextField
          label="Full Name"
          name="full_name"
          type="text"
          defaultValue={profile.full_name}
          maxLength={100}
          required
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Email</span>
          <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-base text-[var(--color-text-muted)]">
            {email}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your email is tied to account sign-in and can&apos;t be changed here yet.
          </p>
        </div>

        <TextField
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={profile.phone ?? ""}
          placeholder="0912345678"
        />
        <TextField
          label="Country"
          name="country"
          type="text"
          defaultValue={profile.country ?? "Ethiopia"}
          maxLength={100}
        />
        <TextField
          label="City"
          name="city"
          type="text"
          defaultValue={profile.city ?? ""}
          maxLength={100}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text)]">Professional Information</h2>
          {!customerProfile ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Complete your professional background so experts can better understand your
              context when you start booking sessions.
            </p>
          ) : null}
        </div>

        <TextField
          label="Current Role"
          name="current_role"
          type="text"
          defaultValue={customerProfile?.current_role ?? ""}
          placeholder="e.g. Marketing Manager"
          maxLength={100}
        />

        <SelectField
          label="Employment Type"
          name="employment_type"
          defaultValue={customerProfile?.employment_type ?? ""}
          options={EMPLOYMENT_TYPES.map((value) => ({
            value,
            label: EMPLOYMENT_TYPE_LABELS[value],
          }))}
        />

        <TextField
          label="Company / Organization"
          name="company_name"
          type="text"
          defaultValue={customerProfile?.company_name ?? ""}
          maxLength={150}
        />

        <SelectField
          label="Industry"
          name="industry_id"
          defaultValue={customerProfile?.industry_id ?? ""}
          options={industries.map((industry) => ({
            value: industry.id,
            label: industry.name,
          }))}
        />

        <SelectField
          label="Years of Experience"
          name="years_experience_range"
          defaultValue={customerProfile?.years_experience_range ?? ""}
          options={EXPERIENCE_RANGES.map((value) => ({
            value,
            label: EXPERIENCE_RANGE_LABELS[value],
          }))}
        />

        <TextField
          label="LinkedIn"
          name="linkedin_url"
          type="url"
          defaultValue={customerProfile?.linkedin_url ?? ""}
          placeholder="https://www.linkedin.com/in/yourname"
          maxLength={300}
        />
      </section>

      <Button type="submit" isLoading={isPending} loadingText="Saving...">
        Save Changes
      </Button>
    </form>
  );
}
