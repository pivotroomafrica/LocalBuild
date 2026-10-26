"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchRescheduleSlotsAction, rescheduleBookingAction } from "@/lib/booking/reschedule";
import { cancelCustomerBookingAction, type CancelBookingState } from "@/lib/booking/cancellation";
import type { BookableSlot, SessionFormat } from "@/types/booking";

export type ManageSituation = "free" | "late" | "expert";

type Props = {
  situation: ManageSituation;
  bookingId: string;
  reference: string;
  expertName: string;
  expertSlug: string | null;
  durationMinutes: number;
  sessionFormat: SessionFormat;
  customerTimezone: string | null;
  currentLabel: string;
  cutoffLabel: string;
  paidLabel: string;
};

/** Friendly reasons, mapped onto the categories cancel_customer_booking()
 * records (CANCELLATION_REASON_CATEGORIES). */
const REASONS = [
  { label: "Something came up at that time", category: "Schedule conflict" },
  { label: "I solved it another way", category: "No longer needed" },
  { label: "I booked by mistake", category: "Booked by mistake" },
  { label: "I'd rather talk to a different expert", category: "Other" },
  { label: "Something else", category: "Other" },
];

const TZ_FALLBACK = "Africa/Addis_Ababa";

function dateKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

function monthBounds(offset: number) {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

type Mode = "choose" | "move" | "cancel";

/**
 * Reschedule or cancel (website design flow). Moving and cancelling go
 * through the same server actions as before (reschedule_customer_booking /
 * cancel_customer_booking), which re-check ownership and the 24-hour cutoff
 * on the server. Refund amounts are not computed here: Pivotroom's team
 * settles every paid cancellation (financial follow-up).
 */
export function ManageBooking(props: Props) {
  const { situation, reference, expertName } = props;
  const firstName = expertName.split(/\s+/)[0] || expertName;
  const tz = props.customerTimezone || TZ_FALLBACK;
  const [mode, setMode] = useState<Mode>("choose");

  const [moveState, moveAction, movePending] = useActionState(rescheduleBookingAction, {});
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelCustomerBookingAction, {} as CancelBookingState);

  if (moveState.success || cancelState.success) {
    const moved = Boolean(moveState.success);
    return (
      <div className="stack" role="status" style={{ gap: 16 }}>
        <span className="circle-icon" aria-hidden="true">
          <span className="ms" style={{ fontSize: 26 }}>
            {moved ? "event_available" : "undo"}
          </span>
        </span>
        <h1 className="ws-h1" style={{ fontSize: "clamp(28px, 3.4vw, 40px)" }}>
          {moved ? "Your session has been moved." : "Your session is cancelled."}
        </h1>
        <p className="muted" style={{ margin: 0, maxWidth: "60ch" }}>
          {moved
            ? `${firstName} has been told, and you'll get an updated confirmation by email. You can still change it until 24 hours before.`
            : `${firstName} has been told. Our team will contact you about your refund to the account you paid with.`}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {moved ? (
            <Link href={`/dashboard/sessions/${reference}/confirmed`} className="btn btn-ink md">
              See the booking{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          ) : (
            <Link href="/experts" className="btn btn-ink md">
              Find another expert{" "}
              <span className="ms af" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          )}
          <Link href="/dashboard/sessions" className="btn btn-line md even">
            My sessions
          </Link>
        </div>
      </div>
    );
  }

  if (mode === "move") {
    return (
      <MoveTime
        {...props}
        tz={tz}
        firstName={firstName}
        onBack={() => setMode("choose")}
        action={moveAction}
        pending={movePending}
        error={moveState.error}
      />
    );
  }

  if (mode === "cancel") {
    return (
      <CancelForm
        reference={reference}
        firstName={firstName}
        paidLabel={props.paidLabel}
        onBack={() => setMode("choose")}
        onMove={() => setMode("move")}
        action={cancelAction}
        pending={cancelPending}
        error={cancelState.error}
      />
    );
  }

  if (situation === "late") {
    return (
      <div className="stack" style={{ gap: 20 }}>
        <div className="stack" style={{ gap: 12 }}>
          <span className="rtag" style={{ alignSelf: "flex-start" }}>
            Starts {props.currentLabel}
          </span>
          <h1 className="ws-h1" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
            The free window has closed. You still have options.
          </h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
            {firstName} has kept this time for you, so inside 24 hours the session can&apos;t be moved or refunded from
            here.
          </p>
        </div>
        <a className="opt" href={`mailto:hello@pivotroom.africa?subject=${encodeURIComponent(`Booking ${reference}`)}`}>
          <span className="oi" aria-hidden="true">
            <span className="ms">forward_to_inbox</span>
          </span>
          <span className="stack" style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>Ask us to check with {firstName}</span>
            <span className="muted" style={{ fontSize: 14 }}>
              Write to us with your booking reference. A person reads it and asks {firstName} for you.
            </span>
          </span>
          <span className="ms af" aria-hidden="true">
            arrow_forward
          </span>
        </a>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Illness, a death in the family, a power or network cut on the day?{" "}
          <a href="mailto:hello@pivotroom.africa">Tell us</a>. A person reads it and we decide fairly.
        </p>
      </div>
    );
  }

  if (situation === "expert") {
    return (
      <div className="stack" style={{ gap: 20 }}>
        <div className="stack" style={{ gap: 12 }}>
          <span className="rtag" style={{ alignSelf: "flex-start" }}>
            Cancelled by the expert
          </span>
          <h1 className="ws-h1" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
            {firstName} had to cancel. You lose nothing.
          </h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
            Our team will refund everything you paid ({props.paidLabel}) to the account you paid with, or help you
            rebook. Tell us which you&apos;d prefer.
          </p>
        </div>
        {props.expertSlug ? (
          <Link className="opt" href={`/experts/${props.expertSlug}`}>
            <span className="oi" aria-hidden="true">
              <span className="ms">event_repeat</span>
            </span>
            <span className="stack" style={{ flex: 1 }}>
              <span style={{ fontWeight: 500 }}>Pick a new time with {firstName}</span>
              <span className="muted" style={{ fontSize: 14 }}>
                Book a new time on the profile, then write to us so we settle the first payment.
              </span>
            </span>
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        ) : null}
        <Link className="opt" href="/experts">
          <span className="oi" aria-hidden="true">
            <span className="ms">group</span>
          </span>
          <span className="stack" style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>See who else could help, sooner</span>
            <span className="muted" style={{ fontSize: 14 }}>
              Browse experts in the same area with earlier open times.
            </span>
          </span>
          <span className="ms af" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
        <a className="opt" href={`mailto:hello@pivotroom.africa?subject=${encodeURIComponent(`Refund for ${reference}`)}`}>
          <span className="oi" aria-hidden="true">
            <span className="ms">undo</span>
          </span>
          <span className="stack" style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>Ask for a full refund</span>
            <span className="muted" style={{ fontSize: 14 }}>
              Everything you paid, VAT included. The cancellation was not your doing.
            </span>
          </span>
          <span className="ms af" aria-hidden="true">
            arrow_forward
          </span>
        </a>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="stack" style={{ gap: 12 }}>
        <h1 className="ws-h1" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
          Plans changed? You can move or cancel until {props.cutoffLabel}.
        </h1>
        <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>
          That&apos;s 24 hours before your session. Moving is free. {firstName} is told straight away either way.
        </p>
      </div>
      <button type="button" className="opt" onClick={() => setMode("move")}>
        <span className="oi" aria-hidden="true">
          <span className="ms">event_repeat</span>
        </span>
        <span className="stack" style={{ flex: 1 }}>
          <span style={{ fontWeight: 500 }}>Move it to another time</span>
          <span className="muted" style={{ fontSize: 14 }}>
            Same expert, same price. Nothing to pay again.
          </span>
        </span>
        <span className="ms af" aria-hidden="true">
          arrow_forward
        </span>
      </button>
      <button type="button" className="opt" onClick={() => setMode("cancel")}>
        <span className="oi" aria-hidden="true">
          <span className="ms">event_busy</span>
        </span>
        <span className="stack" style={{ flex: 1 }}>
          <span style={{ fontWeight: 500 }}>Cancel the session</span>
          <span className="muted" style={{ fontSize: 14 }}>
            Our team refunds you to the account you paid with.
          </span>
        </span>
        <span className="ms af" aria-hidden="true">
          arrow_forward
        </span>
      </button>
    </div>
  );
}

function MoveTime({
  bookingId,
  reference,
  expertSlug,
  durationMinutes,
  sessionFormat,
  customerTimezone,
  currentLabel,
  tz,
  firstName,
  onBack,
  action,
  pending,
  error,
}: Props & {
  tz: string;
  firstName: string;
  onBack: () => void;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
}) {
  const [slots, setSlots] = useState<BookableSlot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<BookableSlot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = (offset: number) => {
      const { start, end } = monthBounds(offset);
      return fetchRescheduleSlotsAction({
        bookingId,
        expertSlug: expertSlug ?? "",
        durationMinutes,
        sessionFormat,
        rangeStart: start,
        rangeEnd: end,
        customerTimezone,
      });
    };
    Promise.all([load(0), load(1)])
      .then(([a, b]) => {
        if (!cancelled) setSlots([...a, ...b]);
      })
      .catch(() => {
        if (!cancelled) setLoadError("We couldn't load available times. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, expertSlug, durationMinutes, sessionFormat, customerTimezone]);

  const byDay = useMemo(() => {
    const map = new Map<string, BookableSlot[]>();
    for (const item of slots ?? []) {
      const key = dateKey(item.startAt, tz);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [slots, tz]);
  const days = Array.from(byDay.keys()).sort().slice(0, 21);
  const times = day ? (byDay.get(day) ?? []) : [];
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });

  return (
    <form action={action} className="stack" style={{ gap: 24 }}>
      <input type="hidden" name="booking_reference" value={reference} />
      <input type="hidden" name="new_start_at" value={slot?.startAt ?? ""} />
      <button type="button" className="back" onClick={onBack}>
        <span className="ms" aria-hidden="true">
          arrow_back
        </span>
        Back
      </button>
      <h1 className="ws-h1" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
        Pick a new time with {firstName}.
      </h1>

      {slots === null && !loadError ? (
        <p className="muted" style={{ margin: 0 }}>
          Loading {firstName}&apos;s open times…
        </p>
      ) : loadError ? (
        <p role="alert" className="notice err" style={{ margin: 0 }}>
          {loadError}
        </p>
      ) : days.length === 0 ? (
        <p className="notice" style={{ margin: 0 }}>
          {firstName} has no open times in the next two months. Write to us and we&apos;ll help.
        </p>
      ) : (
        <>
          <div className="stack" style={{ gap: 12 }}>
            <span id="lbl-day" className="label">
              Day
            </span>
            <div className="days" role="radiogroup" aria-labelledby="lbl-day">
              {days.map((key) => {
                const date = new Date(`${key}T12:00:00Z`);
                const count = byDay.get(key)?.length ?? 0;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={day === key}
                    className={day === key ? "dy on" : "dy"}
                    onClick={() => {
                      setDay(key);
                      setSlot(null);
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>
                    <span className="d num" style={{ fontSize: 20 }}>
                      {date.getUTCDate()}
                    </span>
                    <span style={{ fontSize: 12, opacity: 0.75 }}>{count} free</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <span id="lbl-time" className="label">
              {day ? `Time · ${tz === TZ_FALLBACK ? "Addis Ababa time" : tz}` : "Time · choose a day first"}
            </span>
            <div className="ts" role="group" aria-labelledby="lbl-time">
              {times.map((item) => (
                <button
                  key={item.startAt}
                  type="button"
                  className="chip num"
                  aria-pressed={slot?.startAt === item.startAt}
                  onClick={() => setSlot(item)}
                >
                  {time(item.startAt)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="m-note">
          A note for {firstName} <span className="muted" style={{ fontWeight: 400 }}>· optional</span>
        </label>
        <textarea id="m-note" name="reason" className="input" rows={2} maxLength={500} placeholder="For example: the deadline moved to next week." />
      </div>

      {slot ? (
        <div className="notice num" style={{ display: "flex", alignItems: "center", gap: 10, color: "#0d0f12" }}>
          <span style={{ textDecoration: "line-through", color: "#5c616a" }}>{currentLabel}</span>
          <span className="ms" aria-hidden="true">
            arrow_forward
          </span>
          <span style={{ fontWeight: 600, color: "#2b4fe0" }}>
            {new Date(slot.startAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz })}
          </span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="notice err" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="muted" style={{ fontSize: 14 }}>
          Same price. Nothing to pay.
        </span>
        <button type="submit" className="btn btn-ink md" disabled={!slot || pending}>
          {pending ? "Moving…" : "Move my session"}
          {pending ? null : (
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          )}
        </button>
      </div>
    </form>
  );
}

function CancelForm({
  reference,
  firstName,
  paidLabel,
  onBack,
  onMove,
  action,
  pending,
  error,
}: {
  reference: string;
  firstName: string;
  paidLabel: string;
  onBack: () => void;
  onMove: () => void;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const selected = REASONS.find((item) => item.label === reason) ?? null;

  return (
    <form action={action} className="stack" style={{ gap: 24 }}>
      <input type="hidden" name="booking_reference" value={reference} />
      <input type="hidden" name="reason_category" value={selected?.category ?? ""} />
      <input type="hidden" name="details" value={selected && selected.category === "Other" ? selected.label : ""} />
      <button type="button" className="back" onClick={onBack}>
        <span className="ms" aria-hidden="true">
          arrow_back
        </span>
        Back
      </button>
      <h1 className="ws-h1" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
        Cancel your session with {firstName}?
      </h1>
      <div className="stack" style={{ gap: 12 }}>
        <span id="lbl-why" className="label">
          What changed? <span className="muted" style={{ fontWeight: 400 }}>· helps us, never shown to {firstName}</span>
        </span>
        <div className="stack" role="radiogroup" aria-labelledby="lbl-why" style={{ gap: 8 }}>
          {REASONS.map((item) => (
            <button
              key={item.label}
              type="button"
              role="radio"
              aria-checked={reason === item.label}
              className={reason === item.label ? "rad on" : "rad"}
              onClick={() => setReason(item.label)}
            >
              <span className="dot" aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {reason === REASONS[0].label ? (
        <div className="notice" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>Rather keep the session for later? Moving it is free.</span>
          <button type="button" className="btn btn-line even" onClick={onMove}>
            Move it instead
          </button>
        </div>
      ) : null}
      <div className="panel stack" style={{ gap: 4 }}>
        <div className="row2">
          <span>You paid</span>
          <span className="num">{paidLabel}</span>
        </div>
        <span className="muted" style={{ fontSize: 14, marginBlockStart: 6 }}>
          Our team settles the refund to the account you paid with, normally within [X] working days.
        </span>
      </div>
      {error ? (
        <p role="alert" className="notice err" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn btn-line md even" onClick={onBack}>
          Keep my session
        </button>
        <button type="submit" className="btn btn-ink md even" disabled={!selected || pending}>
          {pending ? "Cancelling…" : "Cancel the session"}
        </button>
      </div>
    </form>
  );
}
