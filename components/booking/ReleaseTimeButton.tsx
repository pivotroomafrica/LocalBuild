"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { releaseBookingReservationAction } from "@/lib/booking/actions";

/**
 * "Release This Time" (spec section 5) -- customer abandonment of their
 * OWN unconfirmed reservation. Not cancellation of a confirmed session:
 * release_booking_reservation() (041) only ever allows held/
 * awaiting_payment, re-derives ownership from auth.uid(), and rejects
 * anything else server-side regardless of what this button assumes.
 * Uses Pivotroom's own ConfirmDialog, never window.confirm.
 */
export function ReleaseTimeButton({
  bookingId,
  bookingReference,
}: {
  bookingId: string;
  bookingReference: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-[var(--color-text-muted)] underline hover:text-[var(--color-text)]"
      >
        Release This Time
      </button>

      <ConfirmDialog
        open={open}
        title="Release this reserved time?"
        description="Someone else may book it after you release it."
        confirmLabel="Release Time"
        confirmingLabel="Releasing..."
        cancelLabel="Keep Reservation"
        destructive
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          const result = await releaseBookingReservationAction(bookingId, bookingReference);
          if (result.error) return { error: result.error };
          setOpen(false);
          router.push("/dashboard/sessions");
          router.refresh();
          return undefined;
        }}
      />
    </>
  );
}
