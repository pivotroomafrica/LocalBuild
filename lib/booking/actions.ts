"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBookableSlots } from "@/lib/booking/data";
import {
  validateCurrentRole,
  validateEmploymentType,
  validateExperienceRange,
} from "@/lib/validation/profile";
import type { BookableSlot, SessionFormat } from "@/types/booking";

export type BookingActionState = {
  error?: string;
  success?: boolean;
};

const GENERIC_ERROR = "We couldn't complete that. Please try again.";

/**
 * The SQL functions in 034_booking_functions.sql only ever raise messages
 * that were written to be shown to a customer as-is (spec sections 79-80)
 * -- never a raw Postgres/Supabase error, constraint name, or stack trace.
 * Anything NOT on this list is something unexpected (a connection issue,
 * a bug) and falls back to the generic message instead of being shown
 * directly.
 */
function toSafeError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR;
  const knownFragments = [
    "logged in",
    "Invalid session duration",
    "Invalid session format",
    "start time is required",
    "not currently accepting bookings",
    "not available for this expert",
    "minimum booking notice",
    "too far in the future",
    "no longer available",
    "just taken",
    "discuss",
    "Discussion topic",
    "context before the session",
    "Additional context",
    "Materials to review",
    "Booking not found",
    "no longer active",
    "reserved time expired",
    "session details first",
    "professional profile first",
  ];
  return knownFragments.some((fragment) => message.toLowerCase().includes(fragment.toLowerCase()))
    ? message
    : GENERIC_ERROR;
}

/**
 * Read-only wrapper callable from the client picker component
 * (components/booking/BookingPicker.tsx) -- month-by-month, never the
 * full 90-day horizon in one call (spec section 21).
 */
export async function fetchBookableSlotsAction(params: {
  expertSlug: string;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  rangeStart: string;
  rangeEnd: string;
  customerTimezone?: string | null;
}): Promise<BookableSlot[]> {
  const supabase = await createClient();
  return getBookableSlots(supabase, params);
}

export type CreateBookingHoldState = {
  error?: string;
  bookingReference?: string;
};

/**
 * The only way a booking row is created (spec section 63) -- resolves
 * customer_id from auth.uid() and expert/session-type/price server-side
 * only, via create_booking_hold() (034). Called from a real form
 * submission (never implicitly during a page render) so reloading
 * /book/[slug] with the same selection in the URL can never silently
 * attempt a second hold.
 */
export async function createBookingHoldAction(
  _prevState: CreateBookingHoldState,
  formData: FormData,
): Promise<CreateBookingHoldState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const expertSlug = String(formData.get("expert_slug") ?? "");
  const durationMinutes = Number(formData.get("duration_minutes"));
  const sessionFormat = String(formData.get("session_format") ?? "");
  const startAt = String(formData.get("start_at") ?? "");
  const customerTimezone = String(formData.get("customer_timezone") ?? "") || undefined;

  if (!expertSlug || !durationMinutes || !sessionFormat || !startAt) {
    return { error: GENERIC_ERROR };
  }

  const { data, error } = await supabase
    .rpc("create_booking_hold", {
      p_expert_slug: expertSlug,
      p_duration_minutes: durationMinutes,
      p_session_format: sessionFormat,
      p_start_at: startAt,
      p_customer_timezone: customerTimezone,
    })
    .maybeSingle();

  if (error) return { error: toSafeError(error.message) };
  if (!data?.booking_reference) return { error: GENERIC_ERROR };

  redirect(`/booking/${data.booking_reference}`);
}

/**
 * Booking-specific completeness gate (spec sections 48-49) -- saves ONLY
 * the four fields advance_booking_to_awaiting_payment() (034) requires,
 * inline within the booking journey. Reuses the exact same
 * customer_profiles row/fields/validators as the regular profile page
 * (lib/profile/actions.ts) -- no duplicate storage, and this does not
 * change those fields' optionality there.
 */
export async function saveBookingProfileAction(
  _prevState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const currentRole = validateCurrentRole(String(formData.get("current_role") ?? ""));
  if (!currentRole.valid) return { error: currentRole.error };
  if (!currentRole.value) return { error: "Please enter your current role." };

  const employmentType = validateEmploymentType(String(formData.get("employment_type") ?? ""));
  if (!employmentType.valid) return { error: employmentType.error };
  if (!employmentType.value) return { error: "Please select your employment type." };

  const experienceRange = validateExperienceRange(String(formData.get("years_experience_range") ?? ""));
  if (!experienceRange.valid) return { error: experienceRange.error };
  if (!experienceRange.value) return { error: "Please select your years of experience." };

  const industryId = String(formData.get("industry_id") ?? "").trim();
  if (!industryId) return { error: "Please select your industry." };

  const bookingReference = String(formData.get("booking_reference") ?? "");

  const fields = {
    current_role: currentRole.value,
    employment_type: employmentType.value,
    industry_id: industryId,
    years_experience_range: experienceRange.value,
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("customer_profiles")
    .update(fields)
    .eq("user_id", user.id)
    .select("id");

  if (updateError) return { error: GENERIC_ERROR };

  if (!updatedRows || updatedRows.length === 0) {
    const { error: insertError } = await supabase
      .from("customer_profiles")
      .insert({ user_id: user.id, ...fields });
    if (insertError && insertError.code !== "23505") return { error: GENERIC_ERROR };
  }

  if (bookingReference) revalidatePath(`/booking/${bookingReference}`);
  return { success: true };
}

/**
 * The only write path into booking_intake (spec sections 50-53) -- one
 * row per booking, upserted by save_booking_intake() (034). Ownership is
 * re-derived server-side from auth.uid() every call, never trusted from
 * the booking_id alone.
 */
export async function saveBookingIntakeAction(
  _prevState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const bookingId = String(formData.get("booking_id") ?? "");
  const bookingReference = String(formData.get("booking_reference") ?? "");
  const discussionTopic = String(formData.get("discussion_topic") ?? "").trim();
  const additionalContext = String(formData.get("additional_context") ?? "").trim();
  const materialsToReview = String(formData.get("materials_to_review") ?? "").trim();

  if (!bookingId) return { error: GENERIC_ERROR };

  const { error } = await supabase.rpc("save_booking_intake", {
    p_booking_id: bookingId,
    p_discussion_topic: discussionTopic,
    p_additional_context: additionalContext,
    p_materials_to_review: materialsToReview || undefined,
  });

  if (error) return { error: toSafeError(error.message) };

  if (bookingReference) revalidatePath(`/booking/${bookingReference}`);
  return { success: true };
}

export type AdvanceBookingState = {
  error?: string;
};

/**
 * "Continue to Payment" (spec section 55) -- does NOT process money.
 * Transitions held -> awaiting_payment and extends the hold via
 * advance_booking_to_awaiting_payment() (034), which independently
 * re-verifies ownership, hold expiry, intake, and profile completeness
 * before allowing the transition. Never writes 'confirmed' -- that
 * belongs to a future payment phase.
 */
export async function advanceBookingToPaymentAction(
  _prevState: AdvanceBookingState,
  formData: FormData,
): Promise<AdvanceBookingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to do that." };

  const bookingId = String(formData.get("booking_id") ?? "");
  const bookingReference = String(formData.get("booking_reference") ?? "");
  if (!bookingId || !bookingReference) return { error: GENERIC_ERROR };

  const { error } = await supabase.rpc("advance_booking_to_awaiting_payment", {
    p_booking_id: bookingId,
  });

  if (error) return { error: toSafeError(error.message) };

  redirect(`/booking/${bookingReference}/payment`);
}
