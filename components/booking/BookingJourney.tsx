"use client";

import { useActionState, useEffect, useState } from "react";
import { TextField } from "@/components/ui/TextField";
import { TextareaField } from "@/components/ui/TextareaField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import {
  saveBookingProfileAction,
  saveBookingIntakeAction,
  advanceBookingToPaymentAction,
  type BookingActionState,
  type AdvanceBookingState,
} from "@/lib/booking/actions";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_RANGES,
  EXPERIENCE_RANGE_LABELS,
} from "@/types/profile";
import {
  SESSION_FORMAT_LABELS,
  DISCUSSION_TOPIC_MAX_LENGTH,
  ADDITIONAL_CONTEXT_MAX_LENGTH,
  MATERIALS_TO_REVIEW_MAX_LENGTH,
  type Booking,
  type BookingIntake,
} from "@/types/booking";
import type { CustomerProfile, Industry } from "@/types/profile";

type Props = {
  booking: Booking;
  intake: BookingIntake | null;
  needsProfile: boolean;
  customerProfile: CustomerProfile | null;
  industries: Industry[];
  expertName: string;
};

const profileInitialState: BookingActionState = {};
const intakeInitialState: BookingActionState = {};
const advanceInitialState: AdvanceBookingState = {};

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

function useCountdown(holdExpiresAt: string | null) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!holdExpiresAt) return;
    const target = new Date(holdExpiresAt).getTime();
    const tick = () => setRemainingMs(Math.max(0, target - Date.now()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  if (remainingMs === null) return null;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { remainingMs, label: `${minutes}:${String(seconds).padStart(2, "0")}` };
}

/**
 * Profile completion (if needed) -> Session Questions -> Review -> Ready
 * for Payment (spec section 9). There is no local `step` state at all --
 * the current step is always derived directly from the `needsProfile` /
 * `intake` props this component receives. Each step's server action
 * calls revalidatePath() on this exact booking route, which causes the
 * parent Server Component (app/booking/[reference]/page.tsx) to re-fetch
 * and pass fresh props in after every successful submit -- so the
 * journey advances purely by re-deriving from real server state (spec
 * section 59: recover via the booking reference server-side, never only
 * React state), the same way a page refresh would.
 *
 * The countdown shown here is presentation only (spec section 57) --
 * hold_expires_at on the server is the sole authority; "Continue to
 * Payment" always re-verifies it via advance_booking_to_awaiting_payment
 * (034) regardless of what this timer displays.
 */
export function BookingJourney({
  booking,
  intake,
  needsProfile,
  customerProfile,
  industries,
  expertName,
}: Props) {
  const step = needsProfile ? "profile" : !intake ? "intake" : "review";
  const countdown = useCountdown(booking.hold_expires_at);
  const [customerTimezone] = useState(detectTimezone);

  const [profileState, profileFormAction, profilePending] = useActionState(
    saveBookingProfileAction,
    profileInitialState,
  );
  const [intakeState, intakeFormAction, intakePending] = useActionState(
    saveBookingIntakeAction,
    intakeInitialState,
  );
  const [advanceState, advanceFormAction, advancePending] = useActionState(
    advanceBookingToPaymentAction,
    advanceInitialState,
  );

  if (countdown && countdown.remainingMs === 0) {
    return (
      <FormMessage variant="error">
        Your reserved time expired. Please refresh this page to see current options.
      </FormMessage>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {countdown ? (
        <div className="rounded-md bg-[var(--color-bg)] px-4 py-2 text-center text-xs text-[var(--color-text-muted)]">
          Time reserved for {countdown.label}
        </div>
      ) : null}

      {step === "profile" ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Your professional background</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            We ask this once so your expert knows a bit about you before your session.
          </p>
          {profileState.error ? <FormMessage variant="error">{profileState.error}</FormMessage> : null}
          <form action={profileFormAction} className="flex flex-col gap-4">
            <input type="hidden" name="booking_reference" value={booking.booking_reference} />
            <TextField
              label="Current role"
              name="current_role"
              defaultValue={customerProfile?.current_role ?? ""}
              maxLength={100}
              required
            />
            <SelectField
              label="Employment type"
              name="employment_type"
              defaultValue={customerProfile?.employment_type ?? ""}
              options={EMPLOYMENT_TYPES.map((value) => ({ value, label: EMPLOYMENT_TYPE_LABELS[value] }))}
              required
            />
            <SelectField
              label="Industry"
              name="industry_id"
              defaultValue={customerProfile?.industry_id ?? ""}
              options={industries.map((industry) => ({ value: industry.id, label: industry.name }))}
              required
            />
            <SelectField
              label="Years of experience"
              name="years_experience_range"
              defaultValue={customerProfile?.years_experience_range ?? ""}
              options={EXPERIENCE_RANGES.map((value) => ({ value, label: EXPERIENCE_RANGE_LABELS[value] }))}
              required
            />
            <Button type="submit" isLoading={profilePending} loadingText="Saving...">
              Continue
            </Button>
          </form>
        </section>
      ) : null}

      {step === "intake" ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Before your session</h2>
          {intakeState.error ? <FormMessage variant="error">{intakeState.error}</FormMessage> : null}
          <form action={intakeFormAction} className="flex flex-col gap-4">
            <input type="hidden" name="booking_id" value={booking.id} />
            <input type="hidden" name="booking_reference" value={booking.booking_reference} />
            <TextareaField
              label="What would you like to discuss during this session?"
              name="discussion_topic"
              defaultValue={intake?.discussion_topic ?? ""}
              maxLength={DISCUSSION_TOPIC_MAX_LENGTH}
              required
            />
            <TextareaField
              label="Give the expert any useful context before the session."
              name="additional_context"
              defaultValue={intake?.additional_context ?? ""}
              maxLength={ADDITIONAL_CONTEXT_MAX_LENGTH}
              required
            />
            <TextareaField
              label="Is there anything specific you'd like the expert to review beforehand?"
              name="materials_to_review"
              defaultValue={intake?.materials_to_review ?? ""}
              maxLength={MATERIALS_TO_REVIEW_MAX_LENGTH}
              hint="Optional"
            />
            <Button type="submit" isLoading={intakePending} loadingText="Saving...">
              Continue
            </Button>
          </form>
        </section>
      ) : null}

      {step === "review" ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Review your booking</h2>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)]">
            <dl className="flex flex-col gap-2">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Expert</dt>
                <dd className="font-medium">{expertName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Session</dt>
                <dd className="font-medium">{booking.duration_minutes} minutes</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Format</dt>
                <dd className="font-medium">{SESSION_FORMAT_LABELS[booking.session_format as "online" | "in_person"]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Date & time</dt>
                <dd className="font-medium">
                  {new Date(booking.start_at).toLocaleString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: customerTimezone || undefined,
                  })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Price</dt>
                <dd className="font-medium">
                  {Number(booking.base_price).toLocaleString()} {booking.currency}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              Prices shown are base session prices. Applicable government taxes will be calculated
              separately.
            </p>
          </div>

          {intake?.discussion_topic ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
              <p className="font-medium text-[var(--color-text)]">What you&apos;ll discuss</p>
              <p className="mt-1 whitespace-pre-wrap text-[var(--color-text-muted)]">
                {intake.discussion_topic}
              </p>
            </div>
          ) : null}

          {advanceState.error ? <FormMessage variant="error">{advanceState.error}</FormMessage> : null}

          <form action={advanceFormAction}>
            <input type="hidden" name="booking_id" value={booking.id} />
            <input type="hidden" name="booking_reference" value={booking.booking_reference} />
            <Button type="submit" isLoading={advancePending} loadingText="Continuing...">
              Continue to Payment
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
