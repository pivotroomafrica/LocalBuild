"use client";

import { useActionState } from "react";
import { adminRetryIntegrationJobAction, type AdminActionState } from "@/lib/admin/actions";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AdminActionState = {};

/** Retries one FAILED integration_jobs row (spec section 33). Only ever
 * shown for a job whose status is currently 'failed' -- the server
 * action's own RPC re-checks that regardless. */
export function AdminRetryJobButton({ jobId, bookingReference }: { jobId: string; bookingReference: string }) {
  const [state, formAction, isPending] = useActionState(adminRetryIntegrationJobAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="booking_reference" value={bookingReference} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-60"
      >
        {isPending ? "Retrying..." : "Retry"}
      </button>
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
    </form>
  );
}
