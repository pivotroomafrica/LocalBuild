"use client";

import { useActionState } from "react";
import { submitManualPaymentAction, type SubmitPaymentState } from "@/lib/payment/actions";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: SubmitPaymentState = {};

/**
 * "After transfer, customer submits: bank used, transaction/reference ID,
 * amount paid, receipt (optional)" (spec section 7). Amount is a plain
 * number input for the customer's convenience only -- it is never trusted
 * as authoritative; submitManualPaymentAction resolves the booking's
 * actual expected_amount server-side and submit_manual_payment() (038)
 * stores this value strictly as amount_paid, separate from that snapshot,
 * so a mismatch is visible to admin rather than silently accepted as the
 * real price (spec sections 6, 9, 31, 46).
 */
export function ManualPaymentForm({ bookingReference }: { bookingReference: string }) {
  const [state, formAction, isPending] = useActionState(submitManualPaymentAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="booking_reference" value={bookingReference} />

      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

      <TextField label="Bank used" name="bank_used" maxLength={150} required />
      <TextField label="Transaction / reference ID" name="transaction_reference" maxLength={200} required />
      <TextField label="Amount paid" name="amount_paid" type="number" step="0.01" min="0.01" required />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="receipt" className="text-sm font-medium text-[var(--color-text)]">
          Receipt (optional)
        </label>
        <input
          id="receipt"
          type="file"
          name="receipt"
          accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
          className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-md file:border file:border-[var(--color-border)] file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <p className="text-xs text-[var(--color-text-muted)]">JPG, PNG, WebP, or PDF. Up to 5 MB.</p>
      </div>

      <Button type="submit" isLoading={isPending} loadingText="Submitting...">
        Submit Payment for Verification
      </Button>
    </form>
  );
}
