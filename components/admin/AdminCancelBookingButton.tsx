"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { adminCancelBookingAction } from "@/lib/admin/actions";

/**
 * Admin override/fallback cancellation (spec sections 4, 16-19) -- bypasses
 * the customer's own 24-hour cutoff. admin_cancel_booking() (045) itself
 * re-checks is_admin() and booking_status = 'confirmed', and never touches
 * payment_status or issues a refund -- same as the customer/expert
 * cancellation paths. A reason is mandatory and stored in the audit
 * trail.
 */
export function AdminCancelBookingButton({
  bookingReference,
}: {
  bookingReference: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
      >
        Cancel Booking (Override)
      </button>

      <ConfirmDialog
        open={open}
        title="Cancel this booking?"
        description={
          <div className="flex flex-col gap-2">
            <p>
              This bypasses the customer&apos;s 24-hour cutoff. Does not touch payment status or issue a refund --
              only flags financial follow-up if applicable, for Phase 11.
            </p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Reason (required)"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </div>
        }
        confirmLabel="Cancel Booking"
        confirmingLabel="Cancelling..."
        cancelLabel="Go Back"
        destructive
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          if (!reason.trim()) return { error: "A reason is required." };
          const formData = new FormData();
          formData.set("booking_reference", bookingReference);
          formData.set("reason", reason.trim());
          const result = await adminCancelBookingAction({}, formData);
          if (result.error) return { error: result.error };
          setOpen(false);
          setReason("");
          return undefined;
        }}
      />
    </>
  );
}
