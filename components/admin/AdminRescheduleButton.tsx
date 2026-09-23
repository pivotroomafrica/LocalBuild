"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminRescheduleModal } from "@/components/admin/AdminRescheduleModal";
import type { SessionFormat } from "@/types/booking";

type Props = {
  bookingId: string;
  bookingReference: string;
  expertSlug: string | null;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  customerTimezone: string | null;
};

/** Opens AdminRescheduleModal -- hidden entirely when expertSlug is
 * unknown (no way to search candidate slots without it), same guard the
 * customer-side SessionActionsPanel applies. */
export function AdminRescheduleButton({
  bookingId,
  bookingReference,
  expertSlug,
  durationMinutes,
  sessionFormat,
  customerTimezone,
}: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (!expertSlug) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
      >
        Reschedule (Override)
      </button>

      <AdminRescheduleModal
        open={open}
        onClose={() => {
          setOpen(false);
          startTransition(() => router.refresh());
        }}
        bookingId={bookingId}
        bookingReference={bookingReference}
        expertSlug={expertSlug}
        durationMinutes={durationMinutes}
        sessionFormat={sessionFormat}
        customerTimezone={customerTimezone}
      />
    </>
  );
}
