"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RescheduleModal } from "@/components/booking/RescheduleModal";
import { CancelBookingModal } from "@/components/booking/CancelBookingModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { declineExpertRescheduleRequestAction } from "@/lib/booking/reschedule";
import type { SessionFormat } from "@/types/booking";

type Props = {
  bookingId: string;
  bookingReference: string;
  expertSlug: string;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  customerTimezone: string | null;
  canReschedule: boolean;
  canCancel: boolean;
  pendingChangeRequestId: string | null;
};

/**
 * Customer session actions (spec sections 1-3, 12, 24) -- Reschedule and
 * Cancel are only ever OFFERED here when canReschedule/canCancel
 * (isReschedulableByCustomer/isCancellableByCustomer, display-only) are
 * true, but the server-side RPCs re-check the same 24-hour cutoff against
 * server time regardless, so this is purely UI convenience, never the
 * actual gate.
 */
export function SessionActionsPanel({
  bookingId,
  bookingReference,
  expertSlug,
  durationMinutes,
  sessionFormat,
  customerTimezone,
  canReschedule,
  canCancel,
  pendingChangeRequestId,
}: Props) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (!canReschedule && !canCancel && !pendingChangeRequestId) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {pendingChangeRequestId ? (
        <button
          type="button"
          onClick={() => setDeclineOpen(true)}
          className="text-sm font-medium text-[var(--color-text-muted)] underline hover:text-[var(--color-text)]"
        >
          Decline Expert&apos;s Request
        </button>
      ) : null}

      {canReschedule ? (
        <button
          type="button"
          onClick={() => setRescheduleOpen(true)}
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
        >
          Reschedule
        </button>
      ) : null}

      {canCancel ? (
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="text-sm font-medium text-[var(--color-danger)] underline hover:opacity-80"
        >
          Cancel Session
        </button>
      ) : null}

      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => {
          setRescheduleOpen(false);
          startTransition(() => router.refresh());
        }}
        bookingId={bookingId}
        bookingReference={bookingReference}
        expertSlug={expertSlug}
        durationMinutes={durationMinutes}
        sessionFormat={sessionFormat}
        customerTimezone={customerTimezone}
      />

      <CancelBookingModal
        open={cancelOpen}
        onClose={() => {
          setCancelOpen(false);
          startTransition(() => router.refresh());
        }}
        bookingReference={bookingReference}
      />

      {pendingChangeRequestId ? (
        <ConfirmDialog
          open={declineOpen}
          title="Decline this reschedule request?"
          description="Your session will stay at its current time. The expert will be notified."
          confirmLabel="Decline Request"
          confirmingLabel="Declining..."
          cancelLabel="Go Back"
          destructive
          onCancel={() => setDeclineOpen(false)}
          onConfirm={async () => {
            const result = await declineExpertRescheduleRequestAction(pendingChangeRequestId, bookingReference);
            if (result.error) return { error: result.error };
            setDeclineOpen(false);
            router.refresh();
            return undefined;
          }}
        />
      ) : null}
    </div>
  );
}
