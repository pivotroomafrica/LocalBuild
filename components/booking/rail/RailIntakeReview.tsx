"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { TextareaField } from "@/components/ui/TextareaField";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { HoldCountdown } from "@/components/booking/HoldCountdown";
import { ReleaseTimeButton } from "@/components/booking/ReleaseTimeButton";
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
  profileComplete: boolean;
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

/**
 * HOLD exists -> (rare fallback: profile, see below) -> INTAKE -> REVIEW
 * (spec states 4-6), adapted from the retired BookingJourney.tsx. Same
 * "no local step state" discipline: which of the three sections renders
 * is derived directly from the booking/intake/profileComplete props this
 * component receives, which the parent rail refreshes via router.refresh()
 * after every successful submit -- never from anything held only in
 * client memory, so a mid-flow page refresh always recovers correctly.
 *
 * The profile-completion section is a defensive fallback only: the new
 * booking rail's own AUTH_OR_PROFILE gate (RailSelect.tsx) now completes
 * this BEFORE a hold is created, so a held booking normally never reaches
 * this branch -- it exists so an already-held booking from before this
 * change (or any other edge case) still has a path forward rather than a
 * dead end.
 */
export function RailIntakeReview({ booking, intake, profileComplete, customerProfile, industries, expertName }: Props) {
  const router = useRouter();
  const [customerTimezone] = useState(detectTimezone);
  const step = !profileComplete ? "profile" : !intake ? "intake" : "review";

  const [profileState, profileFormAction, profilePending] = useActionState(
    saveBookingProfileAction,
    profileInitialState,
  );
  const [handledProfile, setHandledProfile] = useState(false);
  if (profileState.success && !handledProfile) {
    setHandledProfile(true);
    router.refresh();
  }

  const [intakeState, intakeFormAction, intakePending] = useActionState(
    saveBookingIntakeAction,
    intakeInitialState,
  );
  const [handledIntake, setHandledIntake] = useState(false);
  if (intakeState.success && !handledIntake) {
    setHandledIntake(true);
    router.refresh();
  }

  const [advanceState, advanceFormAction, advancePending] = useActionState(
    advanceBookingToPaymentAction,
    advanceInitialState,
  );
  const [handledAdvance, setHandledAdvance] = useState(false);
  if (advanceState.success && !handledAdvance) {
    setHandledAdvance(true);
    router.refresh();
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Time reserved</h2>
        <ReleaseTimeButton bookingId={booking.id} bookingReference={booking.booking_reference} />
      </div>

      {booking.hold_expires_at ? (
        <div className="mb-4 rounded-[var(--radius-input)] bg-[var(--color-bg)] px-4 py-2 text-center">
          <HoldCountdown holdExpiresAt={booking.hold_expires_at} />
        </div>
      ) : null}

      {step === "profile" ? (
        <div className="flex flex-col gap-4">
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
            <Button type="submit" isLoading={profilePending} loadingText="Saving…">
              Continue
            </Button>
          </form>
        </div>
      ) : null}

      {step === "intake" ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-[var(--color-text)]">Before your session</h2>
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
              label="Anything specific you'd like the expert to review beforehand?"
              name="materials_to_review"
              defaultValue={intake?.materials_to_review ?? ""}
              maxLength={MATERIALS_TO_REVIEW_MAX_LENGTH}
              hint="Optional"
            />
            <Button type="submit" isLoading={intakePending} loadingText="Saving…">
              Continue
            </Button>
          </form>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-[var(--color-text)]">Review your booking</h2>

          <dl className="flex flex-col gap-2 rounded-[var(--radius-input)] bg-[var(--color-bg)] p-4 text-sm text-[var(--color-text)]">
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
              <dt className="text-[var(--color-text-muted)]">Base price</dt>
              <dd className="tabular-nums-brand font-medium">
                {Number(booking.base_price).toLocaleString()} {booking.currency}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Booking reference</dt>
              <dd className="font-medium">{booking.booking_reference}</dd>
            </div>
          </dl>
          <p className="text-xs text-[var(--color-text-muted)]">
            Prices shown are base session prices. Applicable government taxes will be calculated
            separately.
          </p>

          {intake?.discussion_topic ? (
            <div className="rounded-[var(--radius-input)] border border-[var(--color-border)] p-4 text-sm">
              <p className="font-medium text-[var(--color-text)]">What you&apos;ll discuss</p>
              <p className="mt-1 whitespace-pre-wrap text-[var(--color-text-muted)]">{intake.discussion_topic}</p>
            </div>
          ) : null}

          {advanceState.error ? <FormMessage variant="error">{advanceState.error}</FormMessage> : null}

          <form action={advanceFormAction}>
            <input type="hidden" name="booking_id" value={booking.id} />
            <input type="hidden" name="booking_reference" value={booking.booking_reference} />
            <Button type="submit" isLoading={advancePending} loadingText="Continuing…">
              Continue to payment
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
