"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInAction, type AuthActionState } from "@/lib/auth/actions";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AuthActionState = {};

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard/profile";
  const justReset = searchParams.get("reset") === "success";

  const [state, formAction, isPending] = useActionState(signInAction, initialState);

  const signupHref =
    next !== "/dashboard/profile" ? `/auth/signup?next=${encodeURIComponent(next)}` : "/auth/signup";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {justReset ? (
        <FormMessage variant="success">Your password has been updated. Log in below.</FormMessage>
      ) : null}
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <input type="hidden" name="next" value={next} />

      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      <div className="-mt-2 text-right">
        <Link
          href="/auth/forgot-password"
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <Button type="submit" isLoading={isPending} loadingText="Logging in...">
        Log In
      </Button>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        Don&apos;t have an account?{" "}
        <Link href={signupHref} className="font-medium text-[var(--color-brand)] hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
