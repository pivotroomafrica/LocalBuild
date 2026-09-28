"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import {
  requestExpertRescheduleAction,
  cancelExpertBookingAction,
  type SessionActionState,
} from "@/lib/expert/actions";

type Props = {
  bookingReference: string;
  hasPendingRequest: boolean;
};

const initialActionState: SessionActionState = {};

/**
 * Expert session actions (spec sections 21-24, 39-42). The expert can
 * REQUEST a reschedule (request_expert_reschedule(), 045, writes only to
 * booking_change_requests -- never touches bookings directly), or cancel
 * their own confirmed session outright, bypassing the customer's 24-hour
 * cutoff since only the expert can know they genuinely cannot provide it.
 * Both require a mandatory reason.
 */
export function ExpertSessionActionsPanel({ bookingReference, hasPendingRequest }: Props) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const router = useRouter();

  const [requestState, requestFormAction, requestPending] = useActionState(
    requestExpertRescheduleAction,
    initialActionState,
  );
  const [cancelState, cancelFormAction, cancelPending] = useActionState(
    cancelExpertBookingAction,
    initialActionState,
  );

  // router.refresh() is an external imperative API, not a plain local
  // setState, so it must run from an effect that itself contains no
  // setState -- the guard flag (and the modal's own open/close state,
  // which IS local) are adjusted directly during render (safe), and a
  // separate effect keyed on the guard flag fires the actual refresh
  // once it flips.
  const [lastHandledRequestSuccess, setLastHandledRequestSuccess] = useState(false);
  if (requestState.success && !lastHandledRequestSuccess) {
    setLastHandledRequestSuccess(true);
    setRequestOpen(false);
  }
  useEffect(() => {
    if (lastHandledRequestSuccess) router.refresh();
  }, [lastHandledRequestSuccess, router]);

  const [lastHandledCancelSuccess, setLastHandledCancelSuccess] = useState(false);
  if (cancelState.success && !lastHandledCancelSuccess) {
    setLastHandledCancelSuccess(true);
    setCancelOpen(false);
  }
  useEffect(() => {
    if (lastHandledCancelSuccess) router.refresh();
  }, [lastHandledCancelSuccess, router]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {hasPendingRequest ? (
        <span className="text-sm text-[var(--color-text-muted)]">Reschedule request pending customer response</span>
      ) : (
        <button
          type="button"
          onClick={() => setRequestOpen(true)}
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
        >
          Request Reschedule
        </button>
      )}

      <button
        type="button"
        onClick={() => setCancelOpen(true)}
        className="text-sm font-medium text-[var(--color-danger)] underline hover:opacity-80"
      >
        Cancel Session
      </button>

      <Modal open={requestOpen} onClose={() => setRequestOpen(false)} title="Request a Reschedule" closeOnEscape={!requestPending}>
        <form action={requestFormAction} className="flex flex-col gap-3">
          <input type="hidden" name="booking_reference" value={bookingReference} />
          <p className="text-sm text-[var(--color-text-muted)]">
            The customer will be notified and can choose a new time. Your session doesn&apos;t change until they do.
          </p>
          <div>
            <label htmlFor="expert_reschedule_reason" className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              Reason (required)
            </label>
            <textarea
              id="expert_reschedule_reason"
              name="reason"
              required
              rows={2}
              maxLength={500}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </div>
          {requestState.error ? <FormMessage variant="error">{requestState.error}</FormMessage> : null}
          <div className="flex gap-2">
            <Button type="submit" isLoading={requestPending} loadingText="Sending...">
              Send Request
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRequestOpen(false)} disabled={requestPending}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Session" closeOnEscape={!cancelPending}>
        <form action={cancelFormAction} className="flex flex-col gap-3">
          <input type="hidden" name="booking_reference" value={bookingReference} />
          <p className="text-sm text-[var(--color-text-muted)]">
            This cancels the session outright. The customer will be notified. This can&apos;t be undone.
          </p>
          <div>
            <label htmlFor="expert_cancel_reason" className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
              Reason (required)
            </label>
            <textarea
              id="expert_cancel_reason"
              name="reason"
              required
              rows={2}
              maxLength={500}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </div>
          {cancelState.error ? <FormMessage variant="error">{cancelState.error}</FormMessage> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={cancelPending}
              className="inline-flex items-center justify-center rounded-md bg-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelPending ? "Cancelling..." : "Cancel Session"}
            </button>
            <Button type="button" variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelPending}>
              Keep Session
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
