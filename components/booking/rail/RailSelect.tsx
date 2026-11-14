"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import "./day-strip.css";
import {
  ADDIS_TIMEZONE,
  DAY_PART_LABELS,
  dayPartOf,
  formatSlotTime,
  formatSlotTimeFull,
  readStoredClientZone,
  storeClientZone,
  styleTimeZone,
  type DayPart,
  type TimeStyle,
} from "@/lib/booking/timeStyle";
import { ADDIS, cityOf, countryOfZone, sameClock, zoneChoices } from "@/lib/geo/clientZone";
import { CountrySelect, Flag, findCountry } from "@/components/ui/CountrySelect";
import { NameFields } from "@/components/auth/NameFields";
import { TermsField } from "@/components/auth/TermsField";
import { AuthDivider, GoogleButton } from "@/components/auth/GoogleButton";
import type { Country } from "@/lib/geo/countries";
import { useRouter } from "next/navigation";
import { LinkedInButton } from "@/components/auth/LinkedInButton";
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
  /** Show "Continue with LinkedIn" in the sign-in step. */
  linkedinEnabled?: boolean;
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
  linkedinEnabled = false,
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
  // The client's own clock: the country they picked (remembered), else the
  // browser's zone, else Addis Ababa. Saved with the booking.
  const [customerTimezone, setCustomerTimezone] = useState(
    () => (typeof window === "undefined" ? null : readStoredClientZone()) ?? (detectTimezone() || ADDIS),
  );
  const clientCountry = findCountry(countryOfZone(customerTimezone) ?? "ET");
  const abroad = clientCountry?.code !== "ET";
  // One rule, no switch: in Ethiopia, Ethiopian time; anywhere else, the
  // client's own clock (set by the country line).
  const timeStyle: TimeStyle = abroad ? "12h" : "ethiopian";
  const [placeOpen, setPlaceOpen] = useState(false);
  const [pane, setPane] = useState<"session" | "day" | "time">("session");
  // Create account in three short screens (name; email and password; how
  // to reach you) so the card never needs scrolling. One form underneath.
  const [signupPart, setSignupPart] = useState<1 | 2 | 3>(1);
  const signupNameRef = useRef<HTMLDivElement>(null);
  const signupAccountRef = useRef<HTMLDivElement>(null);
  const nextSignupPart = () => {
    if (signupPart === 3) return;
    const part = signupPart === 1 ? signupNameRef.current : signupAccountRef.current;
    const fields = part?.querySelectorAll("input") ?? [];
    for (const field of fields) if (!field.reportValidity()) return;
    setSignupPart((signupPart + 1) as 2 | 3);
  };
  const chooseZone = (zone: string, close = false) => {
    setCustomerTimezone(zone);
    storeClientZone(zone);
    setSelectedDate(null);
    setSelectedSlot(null);
    if (close) setPlaceOpen(false);
  };
  const chooseCountry = (country: Country) => {
    const choices = zoneChoices(country.code);
    if (choices.length === 0) return;
    // One clock: that's the whole choice, so close. Several: keep the
    // current one if it's in this country, else the main city, and leave
    // the city list open.
    const keep = choices.find((c) => sameClock(c.zone, customerTimezone)) && countryOfZone(customerTimezone) === country.code;
    chooseZone(keep ? customerTimezone : choices[0].zone, choices.length === 1);
  };
  // Days and times are read on this clock: Addis for Ethiopian time,
  // otherwise theirs.
  const displayZone = styleTimeZone(timeStyle, customerTimezone || undefined);
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
      const key = toDateKey(slot.startAt, displayZone);
      const bucket = map.get(key) ?? [];
      bucket.push(slot);
      map.set(key, bucket);
    }
    return map;
  }, [loadKey, slotsResult, displayZone]);

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

  const placeChoices = clientCountry ? zoneChoices(clientCountry.code) : [];
  const selectedOffering = sessionOfferings.find((offering) => offering.durationMinutes === duration) ?? null;
  // Times grouped by part of the day, in the order the day runs.
  const timeGroups = (["morning", "afternoon", "evening", "night"] as DayPart[])
    .map((part) => ({
      part,
      slots: timesForSelectedDate.filter(
        (slot) => dayPartOf(slot.startAt, timeStyle, customerTimezone || undefined) === part,
      ),
    }))
    .filter((group) => group.slots.length > 0);
  const summary = [
    duration ? `${duration} min` : null,
    selectedOffering ? `ETB ${selectedOffering.price.toLocaleString("en-US")}` : null,
    format ? (format === "online" ? "Google Meet" : "In person") : null,
    selectedSlot
      ? `${new Date(selectedSlot.startAt).toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: styleTimeZone(timeStyle, customerTimezone || undefined),
        })}, ${formatSlotTimeFull(selectedSlot.startAt, timeStyle, customerTimezone || undefined)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // One step at a time so the card stays short: Session -> Day -> Time.
  const formatLabel = format === "online" ? "Google Meet" : format === "in_person" ? "In person" : null;
  const dayLabel = activeDate
    ? new Date(`${activeDate}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : null;
  // Signing in replaces the times, so the row then carries the whole choice.
  const stepSummary =
    gate !== "none" && summary
      ? summary
      : [duration ? `${duration} min` : null, formatLabel, pane === "time" ? dayLabel : null].filter(Boolean).join(" · ");
  const goBack = () => {
    if (gate === "auth" && authTab === "signup" && signupPart > 1) {
      setSignupPart((signupPart - 1) as 1 | 2);
      return;
    }
    if (gate !== "none") {
      setGate("none");
      return;
    }
    setPane(pane === "time" ? "day" : "session");
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      {pane !== "session" ? (
        <div className="rstep">
          <button type="button" className="rstep-back" onClick={goBack}>
            <span className="ms" aria-hidden="true">
              arrow_back
            </span>
            Back
          </button>
          <span className="rstep-sum">{stepSummary}</span>
        </div>
      ) : null}

      {pane === "session" ? (
        <>
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
                // Both choices made: straight on to the day.
                if (format || availableFormats.length <= 1) setPane("day");
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
                  if (duration) setPane("day");
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

      {/* Coming back to this step with both chosen: a way forward again. */}
      {duration && format ? (
        <button type="button" className="btn btn-ink block" style={{ minHeight: 52 }} onClick={() => setPane("day")}>
          Choose a day{" "}
          <span className="ms af" aria-hidden="true">
            arrow_forward
          </span>
        </button>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {!duration && !format && availableFormats.length > 1
            ? "Choose a length and where to meet."
            : !duration
              ? "Choose a length."
              : "Choose where to meet."}
        </p>
      )}
        </>
      ) : null}

      {pane === "day" && duration && format ? (
        <fieldset data-testid="rail-date-time">
          <legend>Pick a day</legend>

          {/* Where they are sets their clock: a country, and a city only
              for the few countries with several clocks. */}
          <div className="place">
            <p className="place-line">
              <span className="muted">Times for</span>{" "}
              {clientCountry ? (
                <>
                  <Flag code={clientCountry.code} />{" "}
                  <strong>{clientCountry.name}</strong>
                  {placeChoices.length > 1 ? <span className="muted"> · {cityOf(customerTimezone)}</span> : null}
                </>
              ) : (
                <strong>{cityOf(customerTimezone)}</strong>
              )}{" "}
              {placeOpen ? null : (
                <button type="button" className="place-change" onClick={() => setPlaceOpen(true)}>
                  Change
                </button>
              )}
            </p>
            {placeOpen ? (
              <div className="place-panel">
                <span className="label" id="rail-country-label">
                  Where are you?
                </span>
                <CountrySelect
                  value={clientCountry}
                  onChange={chooseCountry}
                  labelledBy="rail-country-label"
                  listLabel="Your country"
                />
                {placeChoices.length > 1 ? (
                  <>
                    <span className="label">Which city&apos;s clock?</span>
                    <div className="place-cities" role="radiogroup" aria-label="Your city's clock">
                      {placeChoices.map((choice) => {
                        const on = sameClock(choice.zone, customerTimezone);
                        return (
                          <button
                            key={choice.zone}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            className={on ? "on" : ""}
                            onClick={() => chooseZone(choice.zone, true)}
                          >
                            <span className="place-city">{choice.city}</span>
                            <span className="place-now">now {choice.now}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                {/* At the bottom, where the eye ends up after choosing. */}
                <button type="button" className="btn btn-ink place-done" onClick={() => setPlaceOpen(false)}>
                  Done
                </button>
              </div>
            ) : null}
          </div>

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
                          setPane("time");
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

      {pane === "time" && slotsLoading ? (
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          Loading times…
        </p>
      ) : null}
      {pane === "time" && !slotsLoading && timesForSelectedDate.length === 0 ? (
        <p className="notice" style={{ margin: 0 }}>
          That day has no open times left. Go back and pick another day.
        </p>
      ) : null}

      {pane === "time" && gate === "none" && duration && format && activeDate && timesForSelectedDate.length > 0 ? (
        <fieldset>
          <legend>
            Times on{" "}
            {new Date(`${activeDate}T00:00:00`).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </legend>

          {timeGroups.map((group) => (
            <div key={group.part} className="tgroup">
              <p className="tgroup-label">
                {timeStyle === "ethiopian" ? (
                  <>
                    <span lang="am">{DAY_PART_LABELS[group.part].am}</span> · {DAY_PART_LABELS[group.part].en}
                  </>
                ) : (
                  DAY_PART_LABELS[group.part].en
                )}
              </p>
              <div className="opt-grid c3">
                {group.slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    className="chip"
                    aria-pressed={selectedSlot?.startAt === slot.startAt}
                    aria-label={`${formatSlotTimeFull(slot.startAt, timeStyle, customerTimezone || undefined)}${
                      timeStyle === "ethiopian" ? ` (${formatSlotTime(slot.startAt, "12h", ADDIS_TIMEZONE)})` : ""
                    }`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {formatSlotTime(slot.startAt, timeStyle, customerTimezone || undefined)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      ) : null}

      {pane === "time" && gate === "none" ? (
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
      ) : null}

      {pane === "time" && selectedSlot && gate === "auth" ? (
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

          {/* Google or LinkedIn bring them back to this expert's page signed
              in; the picked time can't survive the trip, so it's picked again
              there. */}
          {authTab === "login" || signupPart === 1 ? (
            <div className="mb-3 flex flex-col gap-3">
              <GoogleButton next={`/experts/${expertSlug}`} />
              {linkedinEnabled ? <LinkedInButton next={`/experts/${expertSlug}`} /> : null}
              <AuthDivider />
            </div>
          ) : null}

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
            <form
              action={signUpFormAction}
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                // Enter before the last screen means Next, not "send".
                if (signupPart < 3) {
                  event.preventDefault();
                  nextSignupPart();
                }
              }}
            >
              {signUpState.error ? <FormMessage variant="error">{signUpState.error}</FormMessage> : null}
              {signUpState.status === "check-email" ? (
                <FormMessage variant="success">
                  Check your email to confirm your account, then come back to this page to continue
                  booking.
                </FormMessage>
              ) : (
                <>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    {signupPart === 1
                      ? "1 of 3 · Your name"
                      : signupPart === 2
                        ? "2 of 3 · Your account"
                        : "3 of 3 · How to reach you"}
                  </p>
                  <div ref={signupNameRef} className="flex flex-col gap-3" hidden={signupPart !== 1}>
                    <NameFields stacked />
                    <Button type="button" onClick={nextSignupPart}>
                      Next
                    </Button>
                  </div>
                  <div ref={signupAccountRef} className="flex flex-col gap-3" hidden={signupPart !== 2}>
                    <TextField label="Email" name="email" type="email" required={signupPart === 2} />
                    <TextField label="Password" name="password" type="password" minLength={8} required={signupPart === 2} />
                    <Button type="button" onClick={nextSignupPart}>
                      Next
                    </Button>
                  </div>
                  <div className="flex flex-col gap-3" hidden={signupPart !== 3}>
                    <PhoneField label="Phone" required={signupPart === 3} />
                    <CountryCityFields required={signupPart === 3} />
                    {signupPart === 3 ? <TermsField /> : null}
                    <Button type="submit" isLoading={signUpPending} loadingText="Creating account…">
                      Create account and continue
                    </Button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      ) : null}

      {pane === "time" && selectedSlot && gate === "profile" ? (
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
