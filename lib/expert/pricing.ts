import { SESSION_DURATIONS, type SessionDuration } from "@/types/expert";

/**
 * The ONE formula for deriving a session-duration price from an expert's
 * 60-minute base rate. Imported by both the client-side live preview
 * (components/expert/SessionPricingForm.tsx, for instant feedback -- "Do
 * not require saving before showing the preview") and the server action
 * that actually persists prices (lib/expert/actions.ts's
 * saveSessionPricingAction, which never trusts a client-submitted price).
 * There must be exactly one place this ratio table lives.
 */
export const DURATION_PRICE_RATIOS: Record<SessionDuration, number> = {
  15: 0.25,
  30: 0.5,
  45: 0.75,
  60: 1,
  90: 1.5,
};

/** Rounded to the nearest whole ETB -- the one rounding rule, used
 * everywhere a duration price is derived. */
export function calculateDurationPrice(basePrice: number, duration: SessionDuration): number {
  return Math.round(basePrice * DURATION_PRICE_RATIOS[duration]);
}

export function calculateAllDurationPrices(
  basePrice: number,
): Record<SessionDuration, number> {
  return Object.fromEntries(
    SESSION_DURATIONS.map((duration) => [duration, calculateDurationPrice(basePrice, duration)]),
  ) as Record<SessionDuration, number>;
}
