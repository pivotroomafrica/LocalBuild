"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { adminReleaseBookingReservationAction } from "@/lib/admin/actions";

/**
 * Admin "Release Reservation" (spec section 6) -- terminates a stuck/
 * rejected unconfirmed booking. admin_release_booking_reservation() (041)
 * re-checks is_admin() and held/awaiting_payment status server-side
 * regardless of what this button assumes; never reachable for a
 * confirmed session.
 */
export function AdminReleaseButton({
  bookingId,
  bookingReference,
}: {
  bookingId: string;
  bookingReference: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
      >
        Release Reservation
      </button>

      <ConfirmDialog
        open={open}
        title="Release this reservation?"
        description="The slot becomes bookable again immediately. This does not affect stored payment history, and cannot be used on a confirmed session."
        confirmLabel="Release Reservation"
        confirmingLabel="Releasing..."
        cancelLabel="Cancel"
        destructive
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          const formData = new FormData();
          formData.set("booking_id", bookingId);
          formData.set("booking_reference", bookingReference);
          const result = await adminReleaseBookingReservationAction({}, formData);
          if (result.error) return { error: result.error };
          setOpen(false);
          return undefined;
        }}
      />
    </>
  );
}
