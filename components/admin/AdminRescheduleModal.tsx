"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { fetchRescheduleSlotsAction } from "@/lib/booking/reschedule";
import { adminRescheduleBookingAction, type AdminActionState } from "@/lib/admin/actions";
import type { BookableSlot, SessionFormat } from "@/types/booking";

type Props = {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  bookingReference: string;
  expertSlug: string;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  customerTimezone: string | null;
};

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

const initialAdminActionState: AdminActionState = {};

/**
 * Admin override/fallback reschedule (spec sections 4, 16-19) -- bypasses
 * the customer's own 24-hour cutoff, but reuses the same
 * fetchRescheduleSlotsAction / get_bookable_slots() engine as the
 * customer flow, so admin_reschedule_booking() (045) still can NEVER
 * bypass double-booking protection. A reason is mandatory here (not
 * optional, unlike the customer flow).
 */
export function AdminRescheduleModal({
  open,
  onClose,
  bookingId,
  bookingReference,
  expertSlug,
  durationMinutes,
  sessionFormat,
  customerTimezone,
}: Props) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookableSlot | null>(null);

  const loadKey = open ? `${bookingId}|${monthCursor.toISOString()}` : null;
  const [slotsResult, setSlotsResult] = useState<{ key: string; slots: BookableSlot[] } | null>(null);
  const [slotsFetchError, setSlotsFetchError] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (!loadKey) return;
    let cancelled = false;
    const { start, end } = monthRange(monthCursor);
    fetchRescheduleSlotsAction({
      bookingId,
      expertSlug,
      durationMinutes,
      sessionFormat,
      rangeStart: start,
      rangeEnd: end,
      customerTimezone,
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
      const key = toDateKey(slot.startAt, customerTimezone ?? undefined);
      const bucket = map.get(key) ?? [];
      bucket.push(slot);
      map.set(key, bucket);
    }
    return map;
  }, [loadKey, slotsResult, customerTimezone]);

  const availableDates = useMemo(() => Array.from(slotsByDate.keys()).sort(), [slotsByDate]);
  const timesForSelectedDate = selectedDate ? (slotsByDate.get(selectedDate) ?? []) : [];

  const [state, formAction, pending] = useActionState(adminRescheduleBookingAction, initialAdminActionState);

  useEffect(() => {
    if (state.success) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  function handleClose() {
    setSelectedDate(null);
    setSelectedSlot(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Admin Override: Reschedule" closeOnEscape={!pending}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          Bypasses the customer&apos;s 24-hour cutoff. Double-booking protection still applies. A reason is
          required and stored in the audit trail.
        </p>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonthCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() - 1, 1)))}
            className="text-sm text-[var(--color-brand)] hover:underline"
          >
            ← Previous
          </button>
          <span className="text-sm font-medium text-[var(--color-text)]">{monthLabel(monthCursor)}</span>
          <button
            type="button"
            onClick={() => setMonthCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)))}
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
            No available times in {monthLabel(monthCursor)}. Try another month.
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
                      timeZone: customerTimezone ?? undefined,
                    })}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {state.error ? <FormMessage variant="error">{state.error}</FormMessage> : null}

        {selectedSlot ? (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="booking_reference" value={bookingReference} />
            <input type="hidden" name="new_start_at" value={selectedSlot.startAt} />
            <div>
              <label htmlFor="admin_reschedule_reason" className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                Reason (required)
              </label>
              <textarea
                id="admin_reschedule_reason"
                name="reason"
                required
                rows={2}
                maxLength={500}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" isLoading={pending} loadingText="Rescheduling...">
                Confirm New Time
              </Button>
              <Button type="button" variant="secondary" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Modal>
  );
}
