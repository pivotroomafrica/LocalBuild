"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBookableSlots } from "@/lib/booking/data";
import type { BookableSlot, SessionFormat } from "@/types/booking";

const GENERIC_ERROR = "We couldn't complete that. Please try again.";

/**
 * reschedule_booking()/decline_expert_reschedule_request() (045) only ever
 * raise messages written to be shown to a customer as-is, same posture as
 * toSafeError() in lib/booking/actions.ts. Anything not on this list falls
 * back to the generic message.
 */
function toSafeError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR;
  const knownFragments = [
    "logged in",
    "Booking not found",
    "not confirmed",
    "cannot be rescheduled",
    "24 hours",
    "hours before",
    "no longer available",
    "just taken",
    "already been requested",
    "no pending",
    "own booking",
  ];
  return knownFragments.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : GENERIC_ERROR;
}

/**
 * Read-only wrapper for the reschedule slot picker -- reuses the exact
 * same get_bookable_slots() engine as original booking (spec section 20),
 * with the booking being rescheduled excluded from its own conflict
 * check via excludeBookingId so its current occupied time never blocks
 * its own candidate slots, while every OTHER booking still blocks.
 */
export async function fetchRescheduleSlotsAction(params: {
  bookingId: string;
  expertSlug: string;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  rangeStart: string;
  rangeEnd: string;
  customerTimezone?: string | null;
}): Promise<BookableSlot[]> {
  const supabase = await createClient();
  return getBookableSlots(supabase, {
    expertSlug: params.expertSlug,
    durationMinutes: params.durationMinutes,
    sessionFormat: params.sessionFormat,
    rangeStart: params.rangeStart,
    rangeEnd: params.rangeEnd,
    customerTimezone: params.customerTimezone,
    excludeBookingId: params.bookingId,
  });
}

export type RescheduleBookingState = {
  error?: string;
  success?: boolean;
};

/**
 * Customer self-service reschedule (spec sections 1-20). Same booking
 * reference, same expert, same duration, same format, same price -- none
 * of those are parameters here, so there is no code path that could
 * accept a client override for any of them. reschedule_booking() (045)
 * itself re-checks ownership, the 24-hour cutoff against server time,
 * and double-booking (via the same exclusion constraints original
 * booking uses) -- this action only forwards the call.
 */
export async function rescheduleBookingAction(
  _prevState: RescheduleBookingState,
  formData: FormData,
): Promise<RescheduleBookingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const bookingReference = String(formData.get("booking_reference") ?? "");
  const newStartAt = String(formData.get("new_start_at") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!bookingReference || !newStartAt) return { error: GENERIC_ERROR };

  const { error } = await supabase.rpc("reschedule_booking", {
    p_booking_reference: bookingReference,
    p_new_start_at: newStartAt,
    p_reason: reason || undefined,
  });

  if (error) return { error: toSafeError(error.message) };

  revalidatePath(`/dashboard/sessions/${bookingReference}`);
  revalidatePath("/dashboard/sessions");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Customer-only decline of a pending expert reschedule request (spec
 * section 24) -- belongs here rather than lib/expert/actions.ts since the
 * caller is always the customer, even though the request itself came
 * from the expert. decline_expert_reschedule_request() (045) re-derives
 * ownership from the underlying booking, not from the request row alone.
 */
export async function declineExpertRescheduleRequestAction(
  requestId: string,
  bookingReference: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const { error } = await supabase.rpc("decline_expert_reschedule_request", { p_request_id: requestId });
  if (error) return { error: toSafeError(error.message) };

  revalidatePath(`/dashboard/sessions/${bookingReference}`);
  revalidatePath("/dashboard/sessions");
  return {};
}
