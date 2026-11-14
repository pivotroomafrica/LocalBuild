"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUpAction, type AuthActionState } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { CountryCityFields } from "@/components/ui/CountryCityFields";
import { PhoneField } from "@/components/ui/PhoneField";
import { NameFields } from "@/components/auth/NameFields";
import { TermsField } from "@/components/auth/TermsField";
import { AuthDivider, GoogleButton, GoogleTermsNote } from "@/components/auth/GoogleButton";
import { LinkedInButton } from "@/components/auth/LinkedInButton";

const initialState: AuthActionState = {};

const STEPS = ["Your account", "About you", "Where you're based"] as const;

/**
 * Create account in three short steps (one form, so everything is sent
 * together at the end). Each step checks its own fields before moving
 * on; Enter moves forward instead of submitting early.
 * `linkedin`: show "Sign up with LinkedIn" (when switched on in Supabase).
 */
export function SignupForm({ linkedin = false }: { linkedin?: boolean }) {
  const searchParams = useSearchParams();
  // Empty = go to the person's own dashboard after signing up.
  const next = searchParams.get("next") ?? "";
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);

  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  // A server error about the email or password belongs on step 1.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.error && /email|password/i.test(state.error)) setStep(0);
  }

  if (state.status === "check-email") {
    return (
      <FormMessage variant="success">
        Check your email to verify your account, then log in.
      </FormMessage>
    );
  }

  const loginHref = next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login";
  const last = STEPS.length - 1;

  /** Checks the visible step's fields, showing the browser's message on the first problem. */
  function stepIsValid(index: number) {
    const fieldset = formRef.current?.querySelector<HTMLFieldSetElement>(`fieldset[data-step="${index}"]`);
    const fields = fieldset
      ? Array.from(fieldset.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"))
      : [];
    const invalid = fields.find((field) => field.type !== "hidden" && !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-5"
      // Each step is checked here (fields on hidden steps can't show the
      // browser's own messages). Enter or Continue moves forward; only the
      // last step actually sends the form.
      noValidate
      onSubmit={(event) => {
        if (!stepIsValid(step)) {
          event.preventDefault();
        } else if (step < last) {
          event.preventDefault();
          setStep(step + 1);
        }
      }}
    >
      <input type="hidden" name="next" value={next} />

      <div className="su-progress" aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}>
        <div className="su-bars" aria-hidden="true">
          {STEPS.map((label, index) => (
            <span key={label} className={index <= step ? "on" : undefined} />
          ))}
        </div>
        <p className="su-step">
          <span className="num">
            Step {step + 1} of {STEPS.length}
          </span>{" "}
          · {STEPS[step]}
        </p>
      </div>

      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <fieldset data-step="0" className="su-fieldset" hidden={step !== 0}>
        <legend className="sr-only">{STEPS[0]}</legend>
        <GoogleButton next={next || undefined} label="Sign up with Google" />
        {linkedin ? <LinkedInButton next={next || undefined} label="Sign up with LinkedIn" /> : null}
        <GoogleTermsNote />
        <AuthDivider />
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
          required
        />
      </fieldset>

      <fieldset data-step="1" className="su-fieldset" hidden={step !== 1}>
        <legend className="sr-only">{STEPS[1]}</legend>
        <NameFields />
        <PhoneField label="Phone number" required />
      </fieldset>

      <fieldset data-step="2" className="su-fieldset" hidden={step !== 2}>
        <legend className="sr-only">{STEPS[2]}</legend>
        <CountryCityFields required />
        <TermsField />
      </fieldset>

      <div className="su-actions">
        {step > 0 ? (
          <button type="button" className="btn btn-line md su-back" onClick={() => setStep(step - 1)}>
            <span className="ms" aria-hidden="true">
              arrow_back
            </span>
            Back
          </button>
        ) : null}
        {step < last ? (
          <Button type="submit">Continue</Button>
        ) : (
          <Button type="submit" isLoading={isPending} loadingText="Creating account...">
            Create account
          </Button>
        )}
      </div>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-[var(--color-accent)] hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
