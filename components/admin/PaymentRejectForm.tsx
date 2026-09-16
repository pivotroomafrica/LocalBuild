"use client";

import { useActionState, useState } from "react";
import { rejectPaymentAction, type AdminPaymentActionState } from "@/lib/payment/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AdminPaymentActionState = {};

/** Reject Payment -- requires a reason (spec section 24), stored in
 * payments.rejection_reason and shown to the customer. Booking is never
 * touched by reject_manual_payment() (038); it stays awaiting_payment so
 * the customer can resubmit. */
export function PaymentRejectForm({ paymentId }: { paymentId: string }) {
  const [state, formAction, isPending] = useActionState(rejectPaymentAction, initialState);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="payment_id" value={paymentId} />
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      <textarea
        name="reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why is this payment being rejected? e.g. &quot;Transaction reference could not be verified.&quot;"
        rows={3}
        maxLength={2000}
        required
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
      />
      <Button type="submit" variant="secondary" isLoading={isPending} loadingText="Rejecting...">
        Reject Payment
      </Button>
    </form>
  );
}
