"use client";

import { useActionState } from "react";
import type { AdminActionState } from "@/lib/admin/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AdminActionState = {};

type Props = {
  expertProfileId: string;
  action: (prevState: AdminActionState, formData: FormData) => Promise<AdminActionState>;
  label: string;
  loadingText: string;
  variant?: "primary" | "secondary";
  confirm?: string;
};

/** One-click admin actions with no extra fields: Approve, Publish,
 * Unpublish, Suspend, Restore. Request Changes / Reject need a message
 * field instead -- see AdminMessageForm. */
export function AdminActionButton({
  expertProfileId,
  action,
  label,
  loadingText,
  variant = "primary",
  confirm,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="expert_profile_id" value={expertProfileId} />
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      <Button type="submit" variant={variant} isLoading={isPending} loadingText={loadingText}>
        {label}
      </Button>
    </form>
  );
}
