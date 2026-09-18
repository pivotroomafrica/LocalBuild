"use client";

import { useActionState } from "react";
import { startChapaPaymentAction, type StartChapaPaymentState } from "@/lib/payment/chapaActions";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

const initialState: StartChapaPaymentState = {};

/** "Pay with Chapa" (spec sections 8, 44-45) -- a plain form submit, not
 * a client-side fetch, so the redirect to Chapa's checkout_url (issued
 * from startChapaPaymentAction via next/navigation's redirect()) works
 * as a normal server-driven navigation. isLoading covers the
 * "Redirecting to Chapa" state (spec section 45) for the moment between
 * click and that redirect actually landing. */
export function ChapaPayButton({ bookingReference }: { bookingReference: string }) {
  const [state, formAction, isPending] = useActionState(startChapaPaymentAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="booking_reference" value={bookingReference} />
      {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}
      <Button type="submit" isLoading={isPending} loadingText="Redirecting to Chapa...">
        Pay with Chapa
      </Button>
    </form>
  );
}
