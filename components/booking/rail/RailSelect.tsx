"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import "./day-strip.css";
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
import { PhoneField } from "@/components/ui/PhoneField";

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

/** Experts can be booked up to 90 days ahead (booking_horizon_days()), and
 * get_bookable_slots() serves at most ~31 days per call, so the whole
 * window is loaded as three ranges at once. */
const HORIZON_RANGES: [number, number][] = [
  [0, 30],
  [31, 61],
  [62, 90],
];

function utcDayPlus(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

/** "2026-11" -> "November 2026". */
function monthLabel(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-11" -> "Nov"; adds the year when it differs from the first tab's
 * ("Jan 2027" after "Dec"). */
function shortMonthLabel(month: string, firstMonth: string | undefined) {
  const [year, mon] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  return firstMonth && firstMonth.slice(0, 4) !== month.slice(0, 4) ? `${name} ${year}` : name;
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
  // The month the client chose with the arrows ("YYYY-MM"); null = the
  // first month that has free times.
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookableSlot | null>(null);
  const [gate, setGate] = useState<Gate>("none");
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");

  const loadKey =
    duration && format ? `${duration}|${format}|${attempt}` : null;

  const [slotsResult, setSlotsResult] = useState<SlotsResult | null>(null);
  const [slotsFetchError, setSlotsFetchError] = useState<SlotsFetchError | null>(null);

  useEffect(() => {
    if (!loadKey || !duration || !format) return;
    let cancelled = false;
    Promise.all(
      HORIZON_RANGES.map(([from, to]) =>
        fetchBookableSlotsAction({
          expertSlug,
          durationMinutes: duration,
          sessionFormat: format,
          rangeStart: utcDayPlus(from),
          rangeEnd: utcDayPlus(to),
          customerTimezone: customerTimezone || undefined,
        }),
      ),
    )
      .then((results) => {
        const seen = new Set<string>();
        const slots = results.flat().filter((slot) => !seen.has(slot.startAt) && seen.add(slot.startAt));
        if (!cancelled) setSlotsResult({ key: loadKey, slots });
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

  const allDates = useMemo(() => Array.from(slotsByDate.keys()).sort(), [slotsByDate]);
  // Only months with free times can be shown, so the arrows skip empty
  // months and never reach back before the first bookable day.
  const availableMonths = useMemo(() => Array.from(new Set(allDates.map((date) => date.slice(0, 7)))), [allDates]);
  const viewMonth =
    chosenMonth && availableMonths.includes(chosenMonth) ? chosenMonth : (availableMonths[0] ?? null);
  const availableDates = viewMonth ? allDates.filter((date) => date.startsWith(viewMonth)) : [];
  // The month's first open day is picked for them until they tap another,
  // so the times show without an extra tap.
  const activeDate = selectedDate && availableDates.includes(selectedDate) ? selectedDate : (availableDates[0] ?? null);
  const timesForSelectedDate = activeDate ? (slotsByDate.get(activeDate) ?? []) : [];
  const stripRef = useRef<HTMLDivElement | null>(null);
  const scrollStrip = (direction: 1 | -1) =>
    stripRef.current?.scrollBy({ left: direction * stripRef.current.clientWidth * 0.8, behavior: "smooth" });
  // Arrows only where there are more days to see, so they never sit on top
  // of the first or last card.
  const [stripEdges, setStripEdges] = useState({ start: true, end: true });
  const measureStrip = (node: HTMLDivElement | null) => {
    if (!node) return;
    const start = node.scrollLeft <= 2;
    const end = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
    setStripEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  };

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

      {/* Days load once both choices are made; say so instead of showing
          nothing, which read as "no dates available". */}
      {!duration || !format ? (
        <fieldset>
          <legend>Day</legend>
          <p className="notice" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="ms" aria-hidden="true" style={{ fontSize: 20 }}>
              calendar_month
            </span>
            {!duration && !format && availableFormats.length > 1
              ? "Choose a length and where to meet, and the open days will show here."
              : !duration
                ? "Choose a length, and the open days will show here."
                : "Choose where to meet, and the open days will show here."}
          </p>
        </fieldset>
      ) : null}

      {duration && format ? (
        <fieldset data-testid="rail-date-time">
          <legend>Day</legend>

          {slotsLoading ? (
            <div className="dstrip-skel" aria-busy="true">
              <span className="sr-only">Loading open days…</span>
              <div className="mtabs" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="dstrip" aria-hidden="true">
                <span className="dcard" />
                <span className="dcard" />
                <span className="dcard" />
                <span className="dcard" />
              </div>
            </div>
          ) : slotsError ? (
            <p role="alert" className="notice err" style={{ margin: 0 }}>
              {slotsError}
            </p>
          ) : availableDates.length === 0 ? (
            <p className="notice" style={{ margin: 0 }}>
              No free times in the next 90 days for this session length. Try another length or format.
            </p>
          ) : (
            <>
              {/* Only months with open days get a tab; the count tells
                  them where the availability is before they tap. */}
              <div className="mtabs" role="tablist" aria-label="Months with open days">
                {availableMonths.map((month) => {
                  const count = allDates.filter((date) => date.startsWith(month)).length;
                  const on = month === viewMonth;
                  return (
                    <button
                      key={month}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className={on ? "mtab on" : "mtab"}
                      aria-label={`${monthLabel(month)}, ${count} open ${count === 1 ? "day" : "days"}`}
                      onClick={() => {
                        setChosenMonth(month);
                        setSelectedDate(null);
                        setSelectedSlot(null);
                        stripRef.current?.scrollTo({ left: 0 });
                      }}
                    >
                      <span className="mtab-name">{shortMonthLabel(month, availableMonths[0])}</span>
                      <span className="mtab-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="dstrip-wrap">
                {stripEdges.start ? null : (
                  <button
                    type="button"
                    className="dstrip-arrow prev"
                    aria-label="Earlier days"
                    onClick={() => scrollStrip(-1)}
                  >
                    <span className="ms" aria-hidden="true">
                      chevron_left
                    </span>
                  </button>
                )}
                <div
                  key={viewMonth}
                  className="dstrip"
                  ref={(node) => {
                    stripRef.current = node;
                    measureStrip(node);
                  }}
                  onScroll={(e) => measureStrip(e.currentTarget)}
                  role="group"
                  aria-label={`Open days in ${monthLabel(viewMonth!)}`}
                >
                  {availableDates.map((date) => {
                    const day = new Date(`${date}T00:00:00`);
                    const open = slotsByDate.get(date)?.length ?? 0;
                    const on = activeDate === date;
                    return (
                      <button
                        key={date}
                        type="button"
                        className={on ? "dcard on" : "dcard"}
                        aria-pressed={on}
                        aria-label={`${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${open} open ${open === 1 ? "time" : "times"}`}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedSlot(null);
                        }}
                      >
                        <span className="dcard-wd">{day.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                        <span className="dcard-d num">{day.getDate()}</span>
                        <span className="dcard-n">{open} open</span>
                      </button>
                    );
                  })}
                </div>
                {stripEdges.end ? null : (
                  <button
                    type="button"
                    className="dstrip-arrow next"
                    aria-label="Later days"
                    onClick={() => scrollStrip(1)}
                  >
                    <span className="ms" aria-hidden="true">
                      chevron_right
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </fieldset>
      ) : null}

      {duration && format && activeDate && timesForSelectedDate.length > 0 ? (
        <fieldset>
          <legend>
            Times on{" "}
            {new Date(`${activeDate}T00:00:00`).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}{" "}
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
                  <PhoneField label="Phone" required />
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
