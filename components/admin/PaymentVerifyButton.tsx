"use client";

import { useActionState } from "react";
import { verifyPaymentAction, type AdminPaymentActionState } from "@/lib/payment/actions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: AdminPaymentActionState = {};

/** Verify Payment -- atomically confirms the booking too
 * (verify_manual_payment(), 038). One-click, same pattern as
 * AdminActionButton (Phase 3), scoped to payment_id instead of
 * expert_profile_id. */
export function PaymentVerifyButton({ paymentId }: { paymentId: string }) {
  const [state, formAction, isPending] = useActionState(verifyPaymentAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Verify this payment and confirm the booking?")) event.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      <Button type="submit" isLoading={isPending} loadingText="Verifying...">
        Verify Payment
      </Button>
    </form>
  );
}
