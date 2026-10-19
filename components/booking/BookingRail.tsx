"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RailSelect } from "@/components/booking/rail/RailSelect";
import { RailIntakeReview } from "@/components/booking/rail/RailIntakeReview";
import { RailPayment } from "@/components/booking/rail/RailPayment";
import { RailConfirmed } from "@/components/booking/rail/RailConfirmed";
import type { RailBookingSnapshot } from "@/lib/booking/railData";
import type { CustomerProfile, Industry } from "@/types/profile";

type SessionOffering = { durationMinutes: number; price: number; currency: string };

type Props = {
  expertSlug: string;
  expertName: string;
  sessionOfferings: SessionOffering[];
  onlineEnabled: boolean;
  inPersonEnabled: boolean;
  isLoggedIn: boolean;
  profileComplete: boolean;
  customerProfile: CustomerProfile | null;
  industries: Industry[];
  snapshot: RailBookingSnapshot | null;
};

type Stage = "select" | "intake_review" | "payment" | "confirmed" | "hold_expired";

const STAGE_ANNOUNCEMENTS: Record<Stage, string> = {
  select: "Choose a session length and time.",
  intake_review: "Time reserved. Complete a few details to continue.",
  payment: "Ready for payment.",
  confirmed: "Booking confirmed.",
  hold_expired: "Your reserved time expired.",
};

function deriveStage(snapshot: RailBookingSnapshot | null): Stage {
  if (!snapshot) return "select";
  const { booking } = snapshot;
  if (booking.booking_status === "confirmed") return "confirmed";
  if (snapshot.holdExpired) return "hold_expired";
  if (booking.booking_status === "held") return "intake_review";
  if (booking.booking_status === "awaiting_payment") return "payment";
  // cancelled/completed/expired (or any other terminal state reached
  // through some other path) -- no active reservation to resume, so the
  // rail falls back to a fresh SESSION state exactly as if `?booking=`
  // were absent.
  return "select";
}

function formatStartingPrice(offerings: SessionOffering[]): string | null {
  if (offerings.length === 0) return null;
  const cheapest = offerings.reduce((min, o) => (o.price < min.price ? o : min), offerings[0]);
  return `From ${cheapest.currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(cheapest.price)}`;
}

function detectTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

const STAGE_TITLE: Record<Stage, string> = {
  select: "Book a session",
  intake_review: "Your details",
  payment: "Payment",
  confirmed: "You're booked",
  hold_expired: "Time expired",
};

const STAGE_STEP: Record<Stage, number | null> = {
  select: 1,
  intake_review: 2,
  payment: 3,
  confirmed: null,
  hold_expired: 1,
};

const MOBILE_BAR_LABEL: Record<Stage, string> = {
  select: "Book",
  intake_review: "Continue booking",
  payment: "Complete payment",
  confirmed: "View confirmation",
  hold_expired: "Choose another time",
};

/**
 * The persistent, stateful booking rail (Phase 12 critical architecture
 * change) -- one mounted instance of the whole state machine, reused for
 * BOTH the desktop sticky aside and the mobile bottom-sheet. Stage is
 * derived entirely from `snapshot` (server-authoritative booking/payment
 * data re-fetched on every router.refresh()/navigation), never from
 * anything held only in this component's own memory -- the same "recover
 * from server state" discipline the pre-rail BookingJourney already used,
 * extended across the whole journey rather than one page of it.
 *
 * `snapshot === null` means "no `?booking=` reference, or it didn't
 * resolve to one this signed-in customer owns" -- both cases fall back to
 * a fresh SESSION state (RailSelect's own local pre-hold state), so a
 * stale/foreign/expired reference in the URL can never eject anyone from
 * the profile or leak whether it exists.
 */
export function BookingRail(props: Props) {
  const { snapshot, sessionOfferings } = props;
  const router = useRouter();
  const pathname = usePathname();
  const stage = deriveStage(snapshot);
  const [customerTimezone] = useState(detectTimezone);
  const [mobileOpen, setMobileOpen] = useState(() => snapshot !== null && stage !== "select");
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Stable identity (useCallback) so RailSelect's own effect that calls
  // this can list it as a dependency without re-firing on every
  // BookingRail render.
  const handleHoldCreated = useCallback(
    (bookingReference: string) => {
      // A real, single new history entry -- Back after this returns to
      // the clean pre-hold profile view (no `?booking=`), which never
      // cancels the hold itself (only an explicit "Release This Time"
      // does that).
      router.push(`${pathname}?booking=${encodeURIComponent(bookingReference)}`, { scroll: false });
    },
    [router, pathname],
  );

  function handleRestart() {
    router.replace(pathname, { scroll: false });
  }

  // Mobile sheet: basic focus trap + Escape-to-close + focus restoration,
  // so a screen-reader/keyboard user is never dropped into the page
  // behind it (spec: "focus trap, Escape/close behavior, focus
  // restoration").
  useEffect(() => {
    if (!mobileOpen) return;
    const sheet = sheetRef.current;
    const firstFocusable = sheet?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    firstFocusable?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  function closeMobileSheet() {
    setMobileOpen(false);
    triggerRef.current?.focus();
  }

  const body = (() => {
    switch (stage) {
      case "select":
        return (
          <RailSelect
            expertSlug={props.expertSlug}
            sessionOfferings={props.sessionOfferings}
            onlineEnabled={props.onlineEnabled}
            inPersonEnabled={props.inPersonEnabled}
            isLoggedIn={props.isLoggedIn}
            profileComplete={props.profileComplete}
            customerProfile={props.customerProfile}
            industries={props.industries}
            onHoldCreated={handleHoldCreated}
          />
        );
      case "intake_review":
        return (
          <RailIntakeReview
            booking={snapshot!.booking}
            intake={snapshot!.intake}
            profileComplete={snapshot!.profileComplete}
            customerProfile={snapshot!.customerProfile}
            industries={props.industries}
            expertName={props.expertName}
          />
        );
      case "payment":
        return (
          <RailPayment
            booking={snapshot!.booking}
            expertSlug={props.expertSlug}
            activeManualPayment={snapshot!.activeManualPayment}
            activeChapaAttempt={snapshot!.activeChapaAttempt}
            latestPayment={snapshot!.latestPayment}
            needsReview={snapshot!.needsReview}
            chapaAvailable={snapshot!.chapaAvailable}
            manualVerificationRequired={snapshot!.manualVerificationRequired}
            bankConfig={snapshot!.bankConfig}
          />
        );
      case "confirmed":
        return <RailConfirmed booking={snapshot!.booking} customerTimezone={customerTimezone} />;
      case "hold_expired":
        return (
          <div className="stack" style={{ gap: 16 }}>
            <p className="muted" style={{ margin: 0 }}>
              Your reserved time expired before payment. Choose an available time to continue.
            </p>
            <button type="button" className="btn btn-ink md block" onClick={handleRestart}>
              Choose another time
            </button>
          </div>
        );
    }
  })();

  const startingPrice = formatStartingPrice(sessionOfferings);
  const step = STAGE_STEP[stage];

  const cardContent = (
    <>
      <div className="stack" style={{ gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 className="d" style={{ margin: 0, fontSize: 20, lineHeight: 1.2 }}>
            {STAGE_TITLE[stage]}
          </h2>
          {step ? (
            <span className="muted num" style={{ fontSize: 14 }}>
              Step {step} of 3
            </span>
          ) : null}
        </div>
        <div className="stepbars" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= (step ?? 3) ? "on" : undefined} />
          ))}
        </div>
      </div>
      {body}
    </>
  );

  return (
    <>
      <div aria-live="polite" className="sr">
        {STAGE_ANNOUNCEMENTS[stage]}
      </div>

      {/* Desktop: the sticky booking card. Below 1040px the same state
          machine runs in the bottom sheet instead (never a second engine). */}
      <div className="bookaside">
        <div className="bookcard">{cardContent}</div>
      </div>

      <div className="bookbar" role="region" aria-label={`Book ${props.expertName}`}>
        <div className="stack" style={{ lineHeight: 1.35, minWidth: 0 }}>
          <span className="num" style={{ fontSize: 16, fontWeight: 600 }}>
            {stage === "select" ? (startingPrice ?? "") : STAGE_TITLE[stage]}
          </span>
          {stage === "select" && sessionOfferings.length > 0 ? (
            <span className="muted" style={{ fontSize: 14 }}>
              {sessionOfferings.map((o) => o.durationMinutes).join(", ")} min · VAT included
            </span>
          ) : null}
        </div>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          className="btn btn-ink md even"
          style={{ flex: "none", paddingInline: 32 }}
        >
          {MOBILE_BAR_LABEL[stage]}
        </button>
      </div>

      {mobileOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Book a session">
          <button type="button" aria-label="Close booking" onClick={closeMobileSheet} className="sheet-scrim" />
          <div ref={sheetRef} className="sheet">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                paddingBlock: "8px 16px",
                marginBlockEnd: 16,
                borderBottom: "1px solid var(--pr-line)",
              }}
            >
              <span className="stack" style={{ lineHeight: 1.3, minWidth: 0 }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  Booking with
                </span>
                <span className="d" style={{ fontSize: 17 }}>
                  {props.expertName}
                </span>
              </span>
              <button
                type="button"
                onClick={closeMobileSheet}
                aria-label="Close booking"
                className="rbtn"
                style={{ border: 0, marginInlineEnd: -10 }}
              >
                <span className="ms" aria-hidden="true" style={{ fontSize: 24 }}>
                  close
                </span>
              </button>
            </div>
            {(stage === "intake_review" || stage === "payment") && snapshot?.booking.hold_expires_at ? (
              <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
                Closing this won&apos;t cancel your reserved time. Reopen it any time before it expires.
              </p>
            ) : null}
            <div className="bookcard" style={{ border: 0, padding: 0 }}>
              {cardContent}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
