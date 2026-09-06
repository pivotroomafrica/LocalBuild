"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signUpAction, type AuthActionState } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AuthActionState = {};

export function SignupForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard/profile";

  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  if (state.status === "check-email") {
    return (
      <FormMessage variant="success">
        Check your email to verify your account, then log in.
      </FormMessage>
    );
  }

  const loginHref = next !== "/dashboard/profile" ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <input type="hidden" name="next" value={next} />

      <TextField
        label="Full Name"
        name="full_name"
        type="text"
        autoComplete="name"
        maxLength={100}
        required
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <TextField
        label="Phone Number"
        name="phone"
        type="tel"
        autoComplete="tel"
        placeholder="0912345678"
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      <Button type="submit" isLoading={isPending} loadingText="Creating account...">
        Sign Up
      </Button>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-[var(--color-brand)] hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
