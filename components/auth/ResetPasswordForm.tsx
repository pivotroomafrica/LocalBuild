"use client";

import { useActionState } from "react";
import { updatePasswordAction, type AuthActionState } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AuthActionState = {};

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(updatePasswordAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <TextField
        label="New Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />

      <Button type="submit" isLoading={isPending} loadingText="Updating...">
        Set New Password
      </Button>
    </form>
  );
}
