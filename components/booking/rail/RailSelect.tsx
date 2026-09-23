"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Icon } from "@/components/ui/Icon";
import {
  fetchBookableSlotsAction,
  createBookingHoldAction,
  type CreateBookingHoldState,
} from "@/lib/booking/actions";
import { saveBookingProfileAction, type BookingActionState } from "@/lib/booking/actions";
import {
  signInForRailAction,
  signUpForRailAction,
  type RailAuthActionState,
} from "@/lib/auth/actions";
import { SESSION_FORMAT_LABELS, type BookableSlot, type SessionFormat } from "@/types/booking";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_RANGES,
  EXPERIENCE_RANGE_LABELS,
} from "@/types/profile";
import type { CustomerProfile, Industry } from "@/types/profile";

type SessionOffering = { durationMinutes: number; price: number; currency: string };

type Props = {
  expertSlug: string;
  sessionOfferings: SessionOffering[];
  onlineEnabled: boolean;
  inPersonEnabled: boolean;
  isLoggedIn: boolean;
  profileComplete: boolean;
  customerProfile: CustomerProfile | null;
  industries: Industry[];
  /** Called once a hold exists -- the parent rail owns the URL update
   * (router.push, one new history entry) so Back after this returns to a
   * clean pre-hold profile view without ever cancelling the hold itself. */
  onHoldCreated: (bookingReference: string) => void;
};

const createHoldInitialState: CreateBookingHoldState = {};
const authInitialState: RailAuthActionState = {};
const profileInitialState: BookingActionState = {};

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

function toDateKey(iso: string, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function monthRange(cursor: Date) {
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function monthLabel(cursor: Date) {
  return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

type SlotsResult = { key: string; slots: BookableSlot[] };
type SlotsFetchError = { key: string; message: string };
type Gate = "none" | "auth" | "profile";

/**
 * SESSION -> TIME -> (inline AUTH_OR_PROFILE gate, only if needed) -> HOLD
 * (spec states 1-4), all as one continuously-revealing panel with zero
 * navigation -- the architecture's whole point. Adapted from the retired
 * BookingPicker.tsx (duration/format/date-time selection + real
 * fetchBookableSlotsAction/create_booking_hold logic preserved exactly),
 * but the old "Sign In to Continue" / "Create Account" *links* (which
 * navigated to a standalone /auth/login) are replaced with an inline gate
 * rendered in place: the customer's duration/format/slot selection never
 * leaves this component's own state, so it survives authentication
 * automatically -- there is nothing to encode into a redirect URL.
 *
 * Reuses the exact same customer_profiles fields/validators as
 * saveBookingProfileAction (lib/booking/actions.ts) -- profile completion
 * now happens BEFORE a hold exists (spec's AUTH_OR_PROFILE precedes HOLD),
 * unlike the old flow where it happened just after.
 *
 * No hold is ever created implicitly -- "Reserve This Time" is always an
 * explicit form submission, even once the gate is already clear.
 */
export function RailSelect({
  expertSlug,
  sessionOfferings,
  onlineEnabled,
  inPersonEnabled,
  isLoggedIn,
  profileComplete,
  customerProfile,
  industries,
  onHoldCreated,
}: Props) {
  const router = useRouter();
  const availableFormats: SessionFormat[] = [
    ...(onlineEnabled ? (["online"] as const) : []),
    ...(inPersonEnabled ? (["in_person"] as const) : []),
  ];

  const [duration, setDuration] = useState<number | null>(null);
  const [format, setFormat] = useState<SessionFormat | null>(
    availableFormats.length === 1 ? availableFormats[0] : null,
  );
  const [customerTimezone] = useState(detectTimezone);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [attempt, setAttempt] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookableSlot | null>(null);
  const [gate, setGate] = useState<Gate>("none");
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");

  const loadKey =
    duration && format ? `${duration}|${format}|${monthCursor.toISOString()}|${attempt}` : null;

  const [slotsResult, setSlotsResult] = useState<SlotsResult | null>(null);
  const [slotsFetchError, setSlotsFetchError] = useState<SlotsFetchError | null>(null);

  useEffect(() => {
    if (!loadKey || !duration || !format) return;
    let cancelled = false;
    const { start, end } = monthRange(monthCursor);
    fetchBookableSlotsAction({
      expertSlug,
      durationMinutes: duration,
      sessionFormat: format,
      rangeStart: start,
      rangeEnd: end,
      customerTimezone: customerTimezone || undefined,
    })
      .then((result) => {
        if (!cancelled) setSlotsResult({ key: loadKey, slots: result });
      })
      .catch(() => {
        if (!cancelled) {
          setSlotsFetchError({ key: loadKey, message: "We couldn't load available times. Please try again." });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  const slotsLoading = loadKey !== null && slotsResult?.key !== loadKey && slotsFetchError?.key !== loadKey;
  const slotsError = loadKey && slotsFetchError?.key === loadKey ? slotsFetchError.message : null;

  const slotsByDate = useMemo(() => {
    const map = new Map<string, BookableSlot[]>();
    const currentSlots = loadKey && slotsResult?.key === loadKey ? slotsResult.slots : [];
    for (const slot of currentSlots) {
      const key = toDateKey(slot.startAt, customerTimezone || undefined);
      const bucket = map.get(key) ?? [];
      bucket.push(slot);
      map.set(key, bucket);
    }
    return map;
  }, [loadKey, slotsResult, customerTimezone]);

  const availableDates = useMemo(() => Array.from(slotsByDate.keys()).sort(), [slotsByDate]);
  const timesForSelectedDate = selectedDate ? (slotsByDate.get(selectedDate) ?? []) : [];

  // --- Hold creation -------------------------------------------------
  const [holdState, holdFormAction, holdPending] = useActionState(
    createBookingHoldAction,
    createHoldInitialState,
  );
  const [lastHandledHoldError, setLastHandledHoldError] = useState<string | undefined>(undefined);
  if (holdState.error && holdState.error !== lastHandledHoldError) {
    setLastHandledHoldError(holdState.error);
    setSelectedSlot(null);
    setAttempt((a) => a + 1);
  }
  const [handledHoldReference, setHandledHoldReference] = useState<string | undefined>(undefined);
  if (holdState.bookingReference && holdState.bookingReference !== handledHoldReference) {
    setHandledHoldReference(holdState.bookingReference);
    onHoldCreated(holdState.bookingReference);
  }

  // --- Inline auth gate ------------------------------------------------
  const [signInState, signInFormAction, signInPending] = useActionState(signInForRailAction, authInitialState);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpForRailAction, authInitialState);
  const [handledLogin, setHandledLogin] = useState(false);
  if ((signInState.success || signUpState.success) && !handledLogin) {
    setHandledLogin(true);
    router.refresh();
  }
  // Once fresh server props confirm the sign-in landed, advance the gate
  // in place -- selection state (duration/format/selectedSlot above) is
  // untouched by this refresh, since nothing here navigates.
  const [advancedPastAuth, setAdvancedPastAuth] = useState(false);
  if (isLoggedIn && gate === "auth" && !advancedPastAuth) {
    setAdvancedPastAuth(true);
    setGate(profileComplete ? "none" : "profile");
  }

  // --- Inline profile-completion gate -----------------------------------
  const [profileState, profileFormAction, profilePending] = useActionState(
    saveBookingProfileAction,
    profileInitialState,
  );
  const [handledProfileSave, setHandledProfileSave] = useState(false);
  if (profileState.success && !handledProfileSave) {
    setHandledProfileSave(true);
    router.refresh();
  }
  const [advancedPastProfile, setAdvancedPastProfile] = useState(false);
  if (profileComplete && gate === "profile" && !advancedPastProfile) {
    setAdvancedPastProfile(true);
    setGate("none");
  }

  if (sessionOfferings.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          Session options are being finalized.
        </p>
      </div>
    );
  }

  const formatLabel = [onlineEnabled ? "Online" : null, inPersonEnabled ? "In person" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)]">Session options</h2>

      <div className="flex flex-col gap-2">
        {sessionOfferings.map((offering) => (
          <button
            key={offering.durationMinutes}
            type="button"
            onClick={() => {
              setDuration(offering.durationMinutes);
              setSelectedSlot(null);
            }}
            aria-pressed={duration === offering.durationMinutes}
            className={`flex items-center justify-between rounded-[var(--radius-input)] border px-4 py-3 text-sm transition-colors ${
              duration === offering.durationMinutes
                ? "border-[var(--color-accent)] bg-[var(--color-accent-tint)]"
                : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-text-muted)]"
            }`}
          >
            <span className="text-[var(--color-text)]">{offering.durationMinutes} min</span>
            <span className="tabular-nums-brand font-medium text-[var(--color-text)]">
              {offering.price.toLocaleString()} {offering.currency}
            </span>
          </button>
        ))}
      </div>
      {formatLabel ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">Available: {formatLabel}</p> : null}
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Prices shown are base session prices. Applicable government taxes will be calculated
        separately.
      </p>

      {duration && availableFormats.length > 1 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">Format</p>
          <div className="flex flex-wrap gap-2">
            {availableFormats.map((f) => (
              <Chip
                key={f}
                selected={format === f}
                onClick={() => {
                  setFormat(f);
                  setSelectedSlot(null);
                }}
              >
                {SESSION_FORMAT_LABELS[f]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {duration && format ? (
        <div className="mt-4" data-testid="rail-date-time">
          <p className="mb-2 text-xs font-medium text-[var(--color-text-muted)]">
            Date & time{customerTimezone ? ` (${customerTimezone})` : ""}
          </p>

          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonthCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - 1, 1)))}
              className="text-sm text-[var(--color-accent)] hover:underline"
              aria-label="Previous month"
            >
              <Icon name="chevron_left" size={20} decorative />
            </button>
            <span className="text-sm font-medium text-[var(--color-text)]">{monthLabel(monthCursor)}</span>
            <button
              type="button"
              onClick={() => setMonthCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)))}
              className="text-sm text-[var(--color-accent)] hover:underline"
              aria-label="Next month"
            >
              <Icon name="chevron_right" size={20} decorative />
            </button>
          </div>

          {slotsLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">Loading available times…</p>
          ) : slotsError ? (
            <FormMessage variant="error">{slotsError}</FormMessage>
          ) : availableDates.length === 0 ? (
            <div className="rounded-[var(--radius-input)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
              No available times in {monthLabel(monthCursor)}. Try another month or session length.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {availableDates.map((date) => (
                  <Chip
                    key={date}
                    selected={selectedDate === date}
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedSlot(null);
                    }}
                  >
                    {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </Chip>
                ))}
              </div>

              {selectedDate ? (
                <div className="flex flex-wrap gap-2">
                  {timesForSelectedDate.map((slot) => (
                    <Chip
                      key={slot.startAt}
                      selected={selectedSlot?.startAt === slot.startAt}
                      onClick={() => setSelectedSlot(slot)}
                    >
                      {new Date(slot.startAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: customerTimezone || undefined,
                      })}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {selectedSlot ? (
        <div className="mt-4 rounded-[var(--radius-input)] bg-[var(--color-bg)] p-4">
          <p className="text-sm text-[var(--color-text)]">
            {new Date(selectedSlot.startAt).toLocaleString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: customerTimezone || undefined,
            })}
          </p>

          {gate === "none" ? (
            <>
              {holdState.error ? (
                <div className="mt-3">
                  <FormMessage variant="error">{holdState.error}</FormMessage>
                </div>
              ) : null}
              {!isLoggedIn || !profileComplete ? (
                <div className="mt-4">
                  <Button type="button" onClick={() => setGate(!isLoggedIn ? "auth" : "profile")}>
                    Continue
                  </Button>
                </div>
              ) : (
                <form action={holdFormAction} className="mt-4">
                  <input type="hidden" name="expert_slug" value={expertSlug} />
                  <input type="hidden" name="duration_minutes" value={duration ?? ""} />
                  <input type="hidden" name="session_format" value={format ?? ""} />
                  <input type="hidden" name="start_at" value={selectedSlot.startAt} />
                  <input type="hidden" name="customer_timezone" value={customerTimezone} />
                  <Button type="submit" isLoading={holdPending} loadingText="Reserving…">
                    Reserve This Time
                  </Button>
                </form>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {selectedSlot && gate === "auth" ? (
        <div className="mt-4 rounded-[var(--radius-input)] border border-[var(--color-border)] p-4">
          <div className="mb-3 flex gap-4 border-b border-[var(--color-border)] text-sm font-medium">
            <button
              type="button"
              onClick={() => setAuthTab("login")}
              className={`-mb-px border-b-2 pb-2 ${authTab === "login" ? "border-[var(--color-accent)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)]"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setAuthTab("signup")}
              className={`-mb-px border-b-2 pb-2 ${authTab === "signup" ? "border-[var(--color-accent)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)]"}`}
            >
              Create account
            </button>
          </div>

          {authTab === "login" ? (
            <form action={signInFormAction} className="flex flex-col gap-3">
              {signInState.error ? <FormMessage variant="error">{signInState.error}</FormMessage> : null}
              <TextField label="Email" name="email" type="email" required />
              <TextField label="Password" name="password" type="password" required />
              <Button type="submit" isLoading={signInPending} loadingText="Signing in…">
                Sign in and continue
              </Button>
            </form>
          ) : (
            <form action={signUpFormAction} className="flex flex-col gap-3">
              {signUpState.error ? <FormMessage variant="error">{signUpState.error}</FormMessage> : null}
              {signUpState.status === "check-email" ? (
                <FormMessage variant="success">
                  Check your email to confirm your account, then come back to this page to continue
                  booking.
                </FormMessage>
              ) : (
                <>
                  <TextField label="Full name" name="full_name" required />
                  <TextField label="Phone" name="phone" type="tel" required />
                  <TextField label="Email" name="email" type="email" required />
                  <TextField label="Password" name="password" type="password" required />
                  <Button type="submit" isLoading={signUpPending} loadingText="Creating account…">
                    Create account and continue
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      ) : null}

      {selectedSlot && gate === "profile" ? (
        <div className="mt-4 rounded-[var(--radius-input)] border border-[var(--color-border)] p-4">
          <h2 className="mb-3 text-sm font-medium text-[var(--color-text)]">Your professional background</h2>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            We ask this once so your expert knows a bit about you before your session.
          </p>
          {profileState.error ? (
            <div className="mb-3">
              <FormMessage variant="error">{profileState.error}</FormMessage>
            </div>
          ) : null}
          <form action={profileFormAction} className="flex flex-col gap-3">
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
    </section>
  );
}
