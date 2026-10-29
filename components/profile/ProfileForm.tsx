"use client";

import { useActionState, useState } from "react";
import { updateProfileAction, type ProfileActionState } from "@/lib/profile/actions";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { CountryCityFields } from "@/components/ui/CountryCityFields";
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

function Heading() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)] sm:text-[32px]">Profile</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        Manage your personal details and professional background.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 border-b border-[var(--color-border)] py-3 last:border-b-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-[var(--color-text-muted)]">{label}</dt>
      <dd className="m-0 break-words text-base text-[var(--color-text)]">
        {value ? value : <span className="text-[var(--color-text-muted)]">Not added</span>}
      </dd>
    </div>
  );
}

/** Read-only view of the saved profile, shown after saving and on return visits. */
function ProfileSummary({
  email,
  profile,
  customerProfile,
  industries,
  justSaved,
  onEdit,
}: Props & { justSaved: boolean; onEdit: () => void }) {
  const industry = industries.find((item) => item.id === customerProfile?.industry_id)?.name;
  return (
    <div className="flex flex-col gap-10">
      <Heading />
      {justSaved ? <FormMessage variant="success">Your changes are saved.</FormMessage> : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Personal Information</h2>
        <dl className="m-0">
          <Row label="Full name" value={profile.full_name} />
          <Row label="Email" value={email} />
          <Row label="Phone" value={profile.phone} />
          <Row label="Country" value={profile.country} />
          <Row label="City" value={profile.city} />
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Professional Information</h2>
        <dl className="m-0">
          <Row label="Current role" value={customerProfile?.current_role} />
          <Row
            label="Employment type"
            value={customerProfile?.employment_type ? EMPLOYMENT_TYPE_LABELS[customerProfile.employment_type as keyof typeof EMPLOYMENT_TYPE_LABELS] : null}
          />
          <Row label="Company / organization" value={customerProfile?.company_name} />
          <Row label="Industry" value={industry} />
          <Row
            label="Years of experience"
            value={
              customerProfile?.years_experience_range
                ? EXPERIENCE_RANGE_LABELS[customerProfile.years_experience_range as keyof typeof EXPERIENCE_RANGE_LABELS]
                : null
            }
          />
          <Row label="LinkedIn" value={customerProfile?.linkedin_url} />
        </dl>
      </section>

      <div>
        <Button type="button" onClick={onEdit} className="sm:w-auto">
          Edit profile
        </Button>
      </div>
    </div>
  );
}

export function ProfileForm({ email, profile, customerProfile, industries }: Props) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);
  // A returning customer sees their details; someone who never filled in the
  // professional part starts on the form.
  const [editing, setEditing] = useState(!customerProfile);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.success) setEditing(false);
  }

  if (!editing) {
    return (
      <ProfileSummary
        email={email}
        profile={profile}
        customerProfile={customerProfile}
        industries={industries}
        justSaved={Boolean(state.success)}
        onEdit={() => setEditing(true)}
      />
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-10">
      <Heading />

      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

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
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-base text-[var(--color-text-muted)]">
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
        <CountryCityFields defaultCountry={profile.country} defaultCity={profile.city} />
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
          label="LinkedIn (optional)"
          name="linkedin_url"
          type="text"
          defaultValue={customerProfile?.linkedin_url ?? ""}
          placeholder="https://www.linkedin.com/in/yourname"
          maxLength={300}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" isLoading={isPending} loadingText="Saving..." className="sm:w-auto">
          Save Changes
        </Button>
        {customerProfile ? (
          <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={isPending} className="sm:w-auto">
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
