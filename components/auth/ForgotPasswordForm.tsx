"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, type AuthActionState } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  if (state.status === "reset-email-sent") {
    return (
      <FormMessage variant="success">
        If an account exists for that email, a password reset link is on its way.
      </FormMessage>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <TextField label="Email" name="email" type="email" autoComplete="email" required />

      <Button type="submit" isLoading={isPending} loadingText="Sending...">
        Send Reset Link
      </Button>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        <Link href="/auth/login" className="font-medium text-[var(--color-brand)] hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
