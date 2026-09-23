import { DERIVED_SESSION_STATE_LABELS, type DerivedSessionState } from "@/types/session";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/types/booking";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/types/payment";

/**
 * Reusable status-label pills (spec section 44) -- every raw DB
 * booking_status/payment_status value already has a human label
 * (BOOKING_STATUS_LABELS / PAYMENT_STATUS_LABELS / DERIVED_SESSION_STATE_
 * LABELS); this is the one place that turns a label into a colored pill,
 * so no page hand-rolls its own status styling or shows a snake_case
 * value directly.
 *
 * Phase 12: there is no red or green in the Pivotroom palette -- blue is
 * the one accent, reserved for informational/confirmed states (the
 * guideline's own example use is literally "confirmed"). A problem state
 * (rejected/cancelled/failed) is never carried by colour alone; it gets
 * an ink border plus its own distinct label text, matching the same "no
 * red, errors stated in words" rule the guideline applies to form
 * errors.
 */
type Tone = "neutral" | "positive" | "attention";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-[var(--color-mist)] text-[var(--color-text-muted)]",
  positive: "bg-[var(--color-accent-tint)] text-[var(--color-accent)]",
  attention: "border border-[var(--color-text)] bg-[var(--color-surface)] text-[var(--color-text)]",
};

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}

function toneForDerivedState(state: DerivedSessionState): Tone {
  switch (state) {
    case "confirmed":
    case "completed":
      return "positive";
    case "payment_needs_attention":
    case "cancelled":
      return "attention";
    default:
      return "neutral";
  }
}

/** Customer-facing pill -- always the derived state, never the raw
 * booking_status/payment_status pair it was built from. */
export function SessionStatusPill({ state }: { state: DerivedSessionState }) {
  return <StatusPill label={DERIVED_SESSION_STATE_LABELS[state]} tone={toneForDerivedState(state)} />;
}

function toneForBookingStatus(status: BookingStatus): Tone {
  switch (status) {
    case "confirmed":
    case "completed":
      return "positive";
    case "cancelled":
    case "expired":
      return "attention";
    default:
      return "neutral";
  }
}

/** Expert/admin-facing pill for a plain booking_status -- an expert only
 * ever sees 'confirmed'/'completed' rows at all, so this never needs the
 * derived customer sub-states. Also used on /admin/bookings, which shows
 * every status. */
export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return <StatusPill label={BOOKING_STATUS_LABELS[status]} tone={toneForBookingStatus(status)} />;
}

function toneForPaymentStatus(status: PaymentStatus): Tone {
  switch (status) {
    case "verified":
    case "paid":
      return "positive";
    case "rejected":
    case "failed":
    case "requires_review":
      return "attention";
    default:
      return "neutral";
  }
}

/** Used on /admin/bookings' payment-status column and /dashboard/payments. */
export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  return <StatusPill label={PAYMENT_STATUS_LABELS[status]} tone={toneForPaymentStatus(status)} />;
}
