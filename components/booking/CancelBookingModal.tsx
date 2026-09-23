"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { cancelCustomerBookingAction, type CancelBookingState } from "@/lib/booking/cancellation";
import { CANCELLATION_REASON_CATEGORIES } from "@/types/booking";

type Props = {
  open: boolean;
  onClose: () => void;
  bookingReference: string;
};

const initialCancelState: CancelBookingState = {};

/**
 * Customer self-service cancellation (spec sections 1, 3, 25-38). Never
 * mentions a refund amount or promises money back -- explains only that
 * this cancels the session, and cancel_customer_booking() itself decides
 * (via financial_followup_required) whether Pivotroom will follow up
 * separately about a paid booking. No refund is ever calculated or
 * issued here or anywhere in Phase 10.
 */
export function CancelBookingModal({ open, onClose, bookingReference }: Props) {
  const [reasonCategory, setReasonCategory] = useState<string>(CANCELLATION_REASON_CATEGORIES[0]);
  const [state, formAction, pending] = useActionState(cancelCustomerBookingAction, initialCancelState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <Modal open={open} onClose={onClose} title="Cancel Session" closeOnEscape={!pending}>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="booking_reference" value={bookingReference} />
        <p className="text-sm text-[var(--color-text-muted)]">
          This cancels your session with the expert. This can&apos;t be undone.
        </p>

        <div>
          <label htmlFor="cancel_reason_category" className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Reason
          </label>
          <select
            id="cancel_reason_category"
            name="reason_category"
            value={reasonCategory}
            onChange={(event) => setReasonCategory(event.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            {CANCELLATION_REASON_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cancel_details" className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            Additional details (optional)
          </label>
          <textarea
            id="cancel_details"
            name="details"
            rows={2}
            maxLength={500}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </div>

        {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md bg-[var(--color-danger)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Cancelling..." : "Cancel Session"}
          </button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Keep Session
          </Button>
        </div>
      </form>
    </Modal>
  );
}
