"use client";

import { useActionState } from "react";
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

/** `linkedin`: show "Sign up with LinkedIn" (when switched on in Supabase). */
export function SignupForm({ linkedin = false }: { linkedin?: boolean }) {
  const searchParams = useSearchParams();
  // Empty = go to the person's own dashboard after signing up.
  const next = searchParams.get("next") ?? "";

  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  if (state.status === "check-email") {
    return (
      <FormMessage variant="success">
        Check your email to verify your account, then log in.
      </FormMessage>
    );
  }

  const loginHref = next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <GoogleButton next={next || undefined} label="Sign up with Google" />
      {linkedin ? <LinkedInButton next={next || undefined} label="Sign up with LinkedIn" /> : null}
      <GoogleTermsNote />
      <AuthDivider />

      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <input type="hidden" name="next" value={next} />

      <NameFields />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <PhoneField label="Phone number" required />
      <CountryCityFields required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      <TermsField />

      <Button type="submit" isLoading={isPending} loadingText="Creating account...">
        Sign Up
      </Button>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-[var(--color-accent)] hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
