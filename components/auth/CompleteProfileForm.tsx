"use client";

import { useActionState } from "react";
import { completeProfileAction, type AuthActionState } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { PhoneField } from "@/components/ui/PhoneField";
import { CountryCityFields } from "@/components/ui/CountryCityFields";

const initialState: AuthActionState = {};

/** After a first "Continue with LinkedIn": the details LinkedIn doesn't share. */
export function CompleteProfileForm({
  fullName,
  phone,
  country,
  city,
  next,
}: {
  fullName: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  next: string;
}) {
  const [state, formAction, isPending] = useActionState(completeProfileAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      <input type="hidden" name="next" value={next} />
      <TextField label="Full Name" name="full_name" defaultValue={fullName} maxLength={100} required />
      <PhoneField label="Phone number" defaultValue={phone} required />
      <CountryCityFields defaultCountry={country} defaultCity={city} required />
      <Button type="submit" isLoading={isPending} loadingText="Saving...">
        Continue
      </Button>
    </form>
  );
}
