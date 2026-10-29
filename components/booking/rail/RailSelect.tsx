"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { FormMessage } from "@/components/ui/FormMessage";
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
import type { BookableSlot, SessionFormat } from "@/types/booking";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_RANGES,
  EXPERIENCE_RANGE_LABELS,
} from "@/types/profile";
import type { CustomerProfile, Industry } from "@/types/profile";
import { CountryCityFields } from "@/components/ui/CountryCityFields";

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
  // onHoldCreated calls router.push -- an external imperative API, not a
  // plain local setState, so it must run from an effect that itself
  // contains no setState (React's render-time-setState allowance only
  // covers a component's own local state; the router mutation has to
  // happen post-commit, never synchronously inside any component's
  // render). The guard flag is adjusted directly during render (the
  // established, lint-clean pattern in this codebase); a SEPARATE effect
  // keyed on that flag fires the actual side effect once it flips.
  const [handledHoldReference, setHandledHoldReference] = useState<string | undefined>(undefined);
  if (holdState.bookingReference && holdState.bookingReference !== handledHoldReference) {
    setHandledHoldReference(holdState.bookingReference);
  }
  useEffect(() => {
    if (handledHoldReference) onHoldCreated(handledHoldReference);
  }, [handledHoldReference, onHoldCreated]);

  // --- Inline auth gate ------------------------------------------------
  const [signInState, signInFormAction, signInPending] = useActionState(signInForRailAction, authInitialState);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpForRailAction, authInitialState);
  const [handledLogin, setHandledLogin] = useState(false);
  if ((signInState.success || signUpState.success) && !handledLogin) {
    setHandledLogin(true);
  }
  useEffect(() => {
    if (handledLogin) router.refresh();
  }, [handledLogin, router]);
  // Once fresh server props confirm the sign-in landed, advance the gate
  // in place -- selection state (duration/format/selectedSlot above) is
  // untouched by this refresh, since nothing here navigates. Plain local
  // setState, so this one is safe to adjust directly during render.
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
  }
  useEffect(() => {
    if (handledProfileSave) router.refresh();
  }, [handledProfileSave, router]);
  const [advancedPastProfile, setAdvancedPastProfile] = useState(false);
  if (profileComplete && gate === "profile" && !advancedPastProfile) {
    setAdvancedPastProfile(true);
    setGate("none");
  }

  if (sessionOfferings.length === 0) {
    return (
      <p className="notice" style={{ margin: 0 }}>
        Session options are being finalized.
      </p>
    );
  }

  const tzLabel =
    customerTimezone === "Africa/Addis_Ababa" ? "Addis Ababa time" : customerTimezone ? `${customerTimezone} time` : "";
  const selectedOffering = sessionOfferings.find((offering) => offering.durationMinutes === duration) ?? null;
  const summary = [
    duration ? `${duration} min` : null,
    selectedOffering ? `ETB ${selectedOffering.price.toLocaleString("en-US")}` : null,
    format ? (format === "online" ? "Google Meet" : "In person") : null,
    selectedSlot
      ? new Date(selectedSlot.startAt).toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: customerTimezone || undefined,
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="stack" style={{ gap: 24 }}>
      <fieldset>
        <legend>Length</legend>
        <div className={`opt-grid ${sessionOfferings.length === 1 ? "c2" : "c3"}`}>
          {sessionOfferings.map((offering) => (
            <button
              key={offering.durationMinutes}
              type="button"
              className="chip tall"
              aria-pressed={duration === offering.durationMinutes}
              onClick={() => {
                setDuration(offering.durationMinutes);
                setSelectedSlot(null);
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600 }}>{offering.durationMinutes} min</span>
              <span className="sub" style={{ fontSize: 14 }}>
                ETB {offering.price.toLocaleString("en-US")}
              </span>
            </button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          Prices include VAT.
        </span>
      </fieldset>

      {availableFormats.length > 0 ? (
        <fieldset>
          <legend>Where</legend>
          <div className="opt-grid c2">
            {availableFormats.map((f) => (
              <button
                key={f}
                type="button"
                className="chip"
                style={{ minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                aria-pressed={format === f}
                onClick={() => {
                  setFormat(f);
                  setSelectedSlot(null);
                }}
              >
                <span className="ms" aria-hidden="true" style={{ fontSize: 20 }}>
                  {f === "online" ? "videocam" : "person"}
                </span>
                {f === "online" ? "Google Meet" : "In person"}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {duration && format ? (
        <fieldset data-testid="rail-date-time">
          <legend style={{ width: "100%" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>Day</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 400 }}>
                <button
                  type="button"
                  className="rbtn"
                  style={{ width: 32, height: 32 }}
                  onClick={() =>
                    setMonthCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - 1, 1)))
                  }
                  aria-label="Previous month"
                >
                  <span className="ms" aria-hidden="true">
                    chevron_left
                  </span>
                </button>
                <span className="muted" style={{ fontSize: 14, minWidth: 110, textAlign: "center" }}>
                  {monthLabel(monthCursor)}
                </span>
                <button
                  type="button"
                  className="rbtn"
                  style={{ width: 32, height: 32 }}
                  onClick={() =>
                    setMonthCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)))
                  }
                  aria-label="Next month"
                >
                  <span className="ms" aria-hidden="true">
                    chevron_right
                  </span>
                </button>
              </span>
            </span>
          </legend>

          {slotsLoading ? (
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              Loading available times…
            </p>
          ) : slotsError ? (
            <p role="alert" className="notice err" style={{ margin: 0 }}>
              {slotsError}
            </p>
          ) : availableDates.length === 0 ? (
            <p className="notice" style={{ margin: 0 }}>
              No free times in {monthLabel(monthCursor)}. Try the next month or another session length.
            </p>
          ) : (
            <div className="opt-grid c5">
              {availableDates.map((date) => {
                const day = new Date(`${date}T00:00:00`);
                return (
                  <button
                    key={date}
                    type="button"
                    className="chip day"
                    aria-pressed={selectedDate === date}
                    aria-label={day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedSlot(null);
                    }}
                  >
                    <span className="sub">{day.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                    <span className="big">{day.getDate()}</span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      ) : null}

      {duration && format && selectedDate && timesForSelectedDate.length > 0 ? (
        <fieldset>
          <legend>
            Time{" "}
            {tzLabel ? (
              <span className="muted" style={{ fontWeight: 400 }}>
                · {tzLabel}
              </span>
            ) : null}
          </legend>
          <div className="opt-grid c3">
            {timesForSelectedDate.map((slot) => (
              <button
                key={slot.startAt}
                type="button"
                className="chip"
                aria-pressed={selectedSlot?.startAt === slot.startAt}
                onClick={() => setSelectedSlot(slot)}
              >
                {new Date(slot.startAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: customerTimezone || undefined,
                })}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="stack" style={{ gap: 12, paddingBlockStart: 20, borderTop: "1px solid var(--pr-line)" }}>
        {summary ? <span className="summary-line">{summary}</span> : null}
        {holdState.error && gate === "none" ? (
          <p role="alert" className="notice err" style={{ margin: 0 }}>
            {holdState.error}
          </p>
        ) : null}
        {!selectedSlot ? (
          <button type="button" className="btn block" style={{ minHeight: 52 }} disabled>
            Pick a time to continue
          </button>
        ) : gate !== "none" ? null : !isLoggedIn || !profileComplete ? (
          <button
            type="button"
            className="btn btn-ink block"
            style={{ minHeight: 52 }}
            onClick={() => setGate(!isLoggedIn ? "auth" : "profile")}
          >
            Continue{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </button>
        ) : (
          <form action={holdFormAction}>
            <input type="hidden" name="expert_slug" value={expertSlug} />
            <input type="hidden" name="duration_minutes" value={duration ?? ""} />
            <input type="hidden" name="session_format" value={format ?? ""} />
            <input type="hidden" name="start_at" value={selectedSlot.startAt} />
            <input type="hidden" name="customer_timezone" value={customerTimezone} />
            <button type="submit" className="btn btn-ink block" style={{ minHeight: 52 }} disabled={holdPending}>
              {holdPending ? "Reserving…" : "Reserve this time"}
              {holdPending ? null : (
                <span className="ms af" aria-hidden="true">
                  arrow_forward
                </span>
              )}
            </button>
          </form>
        )}
      </div>

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
                  <CountryCityFields required />
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
    </div>
  );
}
