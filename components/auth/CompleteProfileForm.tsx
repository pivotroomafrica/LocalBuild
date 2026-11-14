"use client";

import { useActionState } from "react";
import { completeProfileAction, type AuthActionState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { CountryCityFields } from "@/components/ui/CountryCityFields";
import { PhoneField } from "@/components/ui/PhoneField";
import { NameFields } from "@/components/auth/NameFields";
import { TermsField } from "@/components/auth/TermsField";

const initialState: AuthActionState = {};

/** The one-time "Finish your profile" form after a first Google sign-in. */
export function CompleteProfileForm({
  next,
  defaults,
  phone,
  country,
  city,
}: {
  next: string;
  defaults: { first: string; middle: string; last: string };
  phone: string;
  country: string | null;
  city: string | null;
}) {
  const [state, formAction, isPending] = useActionState(completeProfileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      <input type="hidden" name="next" value={next} />

      <NameFields defaults={defaults} />
      <PhoneField label="Phone number" defaultValue={phone} required />
      <CountryCityFields defaultCountry={country} defaultCity={city} required />
      <TermsField />

      <Button type="submit" isLoading={isPending} loadingText="Saving...">
        Continue
      </Button>
    </form>
  );
}
