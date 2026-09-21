"use client";

import { useActionState } from "react";
import { adminBackfillBookingIntegrationsAction, type AdminActionState } from "@/lib/admin/actions";
import { FormMessage } from "@/components/ui/FormMessage";
import { Button } from "@/components/ui/Button";

const initialState: AdminActionState = {};

/** Controlled, explicit, one-booking-at-a-time backfill (spec section
 * 10) for a booking that was already confirmed before Phase 9 shipped
 * -- shown only when a confirmed booking currently has zero
 * integration_jobs rows. Idempotent: safe to click more than once. */
export function AdminBackfillIntegrationsButton({
  bookingId,
  bookingReference,
}: {
  bookingId: string;
  bookingReference: string;
}) {
  const [state, formAction, isPending] = useActionState(adminBackfillBookingIntegrationsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="booking_reference" value={bookingReference} />
      <Button type="submit" isLoading={isPending} loadingText="Sending...">
        Send Confirmation Email + Create Calendar Event
      </Button>
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage variant="success">Queued -- check back shortly.</FormMessage> : null}
    </form>
  );
}
