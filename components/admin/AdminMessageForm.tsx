"use client";

import { useActionState, useState } from "react";
import type { AdminActionState } from "@/lib/admin/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AdminActionState = {};

type Props = {
  expertProfileId: string;
  action: (prevState: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  label: string;
  loadingText: string;
  placeholder: string;
  variant?: "primary" | "secondary";
};

/** Request Changes / Reject: both require a non-empty message, stored in
 * expert_profiles.review_message and shown to the applicant. */
export function AdminMessageForm({
  expertProfileId,
  action,
  label,
  loadingText,
  placeholder,
  variant = "secondary",
}: Props) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [message, setMessage] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="expert_profile_id" value={expertProfileId} />
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      <textarea
        name="message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={2000}
        required
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
      />
      <Button type="submit" variant={variant} isLoading={isPending} loadingText={loadingText}>
        {label}
      </Button>
    </form>
  );
}
