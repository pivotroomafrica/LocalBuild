"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { fetchBookableSlotsAction, createBookingHoldAction, type CreateBookingHoldState } from "@/lib/booking/actions";
import { SESSION_FORMAT_LABELS, type BookableSlot, type SessionFormat } from "@/types/booking";

type SessionOffering = { durationMinutes: number; price: number; currency: string };

type Props = {
  expertSlug: string;
  expertName: string;
  sessionOfferings: SessionOffering[];
  onlineEnabled: boolean;
  inPersonEnabled: boolean;
  isLoggedIn: boolean;
  initialDuration: number | null;
  initialFormat: string | null;
  initialStart: string | null;
};

const createHoldInitialState: CreateBookingHoldState = {};

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

/**
 * Duration -> Format -> Date & Time, then Sign In/Create Account (if
 * needed) -> Reserve This Time (spec section 9). Every selection lives in
 * this component's state and is encoded into the "next" URL when a login
 * round-trip is required (spec section 27), so the exact candidate the
 * customer picked survives auth and is independently revalidated by
 * create_booking_hold() (034_booking_functions.sql) regardless of what
 * this component displayed.
 *
 * No hold is ever created implicitly on page load/refresh (spec section
 * 26: no anonymous holds) -- "Reserve This Time" is always an explicit
 * form submission.
 *
 * Slot loading state is derived (a "loadKey" computed from
 * duration/format/month/attempt vs. the key of the last completed fetch)
 * rather than tracked with a separate loading flag set inside an effect
 * -- avoids synchronizing local state from an effect entirely.
 */
export function BookingPicker({
  expertSlug,
  expertName,
  sessionOfferings,
  onlineEnabled,
  inPersonEnabled,
  isLoggedIn,
  initialDuration,
  initialFormat,
  initialStart,
}: Props) {
  const pathname = usePathname();
  const availableFormats: SessionFormat[] = [
    ...(onlineEnabled ? (["online"] as const) : []),
    ...(inPersonEnabled ? (["in_person"] as const) : []),
  ];

  const [duration, setDuration] = useState<number | null>(
    initialDuration && sessionOfferings.some((o) => o.durationMinutes === initialDuration)
      ? initialDuration
      : null,
  );
  const [format, setFormat] = useState<SessionFormat | null>(
    initialFormat === "online" || initialFormat === "in_person"
      ? (initialFormat as SessionFormat)
      : availableFormats.length === 1
        ? availableFormats[0]
        : null,
  );

  const [customerTimezone] = useState(detectTimezone);

  const [monthCursor, setMonthCursor] = useState(() => {
    const base = initialStart ? new Date(initialStart) : new Date();
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  });
  const [attempt, setAttempt] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialStart ? initialStart.slice(0, 10) : null,
  );
  const [selectedSlot, setSelectedSlot] = useState<BookableSlot | null>(null);

  const loadKey =
    duration && format ? `${duration}|${format}|${monthCursor.toISOString()}|${attempt}` : null;

  const [slotsResult, setSlotsResult] = useState<SlotsResult | null>(null);
  const [slotsFetchError, setSlotsFetchError] = useState<SlotsFetchError | null>(null);

  // Fetching is the one legitimate use of an effect here (synchronizing
  // with the server, spec section 21's month-by-month loading) -- no
  // setState is called synchronously in the effect body itself, only
  // inside the .then()/.catch() continuations once the request actually
  // resolves, so there is nothing to desynchronize from a render.
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

  if (sessionOfferings.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          {expertName} doesn&apos;t have any session options available right now.
        </p>
      </div>
    );
  }

  const resumeUrl = duration && format && selectedSlot
    ? `${pathname}?duration=${duration}&format=${format}&start=${encodeURIComponent(selectedSlot.startAt)}`
    : pathname;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Book a session with {expertName}</h1>

      {/* Step 1: Duration */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">1. Session length</h2>
        <div className="flex flex-wrap gap-2">
          {sessionOfferings.map((offering) => (
            <button
              key={offering.durationMinutes}
              type="button"
              onClick={() => {
                setDuration(offering.durationMinutes);
                setSelectedSlot(null);
              }}
              className={`rounded-md border px-4 py-2.5 text-sm transition-colors ${
                duration === offering.durationMinutes
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]"
              }`}
            >
              {offering.durationMinutes} min · {offering.price.toLocaleString()} {offering.currency}
            </button>
          ))}
        </div>
      </section>

      {/* Step 2: Format (only when there's a real choice) */}
      {duration && availableFormats.length > 1 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">2. Format</h2>
          <div className="flex flex-wrap gap-2">
            {availableFormats.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFormat(f);
                  setSelectedSlot(null);
                }}
                className={`rounded-md border px-4 py-2.5 text-sm transition-colors ${
                  format === f
                    ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                }`}
              >
                {SESSION_FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Step 3: Date & time */}
      {duration && format ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--color-text)]">3. Date & time</h2>
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            {customerTimezone ? `Times shown in your timezone: ${customerTimezone}` : null}
          </p>

          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setMonthCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - 1, 1)))
              }
              className="text-sm text-[var(--color-brand)] hover:underline"
            >
              ← Previous
            </button>
            <span className="text-sm font-medium text-[var(--color-text)]">{monthLabel(monthCursor)}</span>
            <button
              type="button"
              onClick={() =>
                setMonthCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)))
              }
              className="text-sm text-[var(--color-brand)] hover:underline"
            >
              Next →
            </button>
          </div>

          {slotsLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">Loading available times...</p>
          ) : slotsError ? (
            <FormMessage variant="error">{slotsError}</FormMessage>
          ) : availableDates.length === 0 ? (
            <div className="rounded-md bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
              No available times for this session length in {monthLabel(monthCursor)}. Try another month or a
              different session length.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {availableDates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedSlot(null);
                    }}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                      selectedDate === date
                        ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                    }`}
                  >
                    {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </button>
                ))}
              </div>

              {selectedDate ? (
                <div className="flex flex-wrap gap-2">
                  {timesForSelectedDate.map((slot) => (
                    <button
                      key={slot.startAt}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                        selectedSlot?.startAt === slot.startAt
                          ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-white"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                      }`}
                    >
                      {new Date(slot.startAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: customerTimezone || undefined,
                      })}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {/* Step 4: confirm */}
      {selectedSlot ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
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

          {holdState.error ? (
            <div className="mt-3">
              <FormMessage variant="error">{holdState.error}</FormMessage>
            </div>
          ) : null}

          {isLoggedIn ? (
            <form action={holdFormAction} className="mt-4">
              <input type="hidden" name="expert_slug" value={expertSlug} />
              <input type="hidden" name="duration_minutes" value={duration ?? ""} />
              <input type="hidden" name="session_format" value={format ?? ""} />
              <input type="hidden" name="start_at" value={selectedSlot.startAt} />
              <input type="hidden" name="customer_timezone" value={customerTimezone} />
              <Button type="submit" isLoading={holdPending} loadingText="Reserving...">
                Reserve This Time
              </Button>
            </form>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/auth/login?next=${encodeURIComponent(resumeUrl)}`}
                className="inline-flex w-full items-center justify-center rounded-md bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)] sm:w-auto"
              >
                Sign In to Continue
              </Link>
              <Link
                href={`/auth/signup?next=${encodeURIComponent(resumeUrl)}`}
                className="inline-flex w-full items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] sm:w-auto"
              >
                Create Account
              </Link>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
