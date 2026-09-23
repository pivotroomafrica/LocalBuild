"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
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
  return `From ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(cheapest.price)} ${cheapest.currency}`;
}

function detectTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

const MOBILE_BAR_LABEL: Record<Stage, string> = {
  select: "Book a session",
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

  function handleHoldCreated(bookingReference: string) {
    // A real, single new history entry -- Back after this returns to the
    // clean pre-hold profile view (no `?booking=`), which never cancels
    // the hold itself (only an explicit "Release This Time" does that).
    router.push(`${pathname}?booking=${encodeURIComponent(bookingReference)}`, { scroll: false });
  }

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
            bankConfig={snapshot!.bankConfig}
          />
        );
      case "confirmed":
        return <RailConfirmed booking={snapshot!.booking} customerTimezone={customerTimezone} />;
      case "hold_expired":
        return (
          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
            <p className="mb-1 text-sm font-medium text-[var(--color-text)]">Your reserved time expired</p>
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">Choose an available time to continue.</p>
            <Button type="button" onClick={handleRestart}>
              Choose another time
            </Button>
          </section>
        );
    }
  })();

  const startingPrice = formatStartingPrice(sessionOfferings);

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {STAGE_ANNOUNCEMENTS[stage]}
      </div>

      {/* Desktop: persistent sticky rail -- never a narrow compressed
          sidebar below the lg breakpoint (spec: switch to the mobile sheet
          architecture instead of compressing). */}
      <aside className="hidden w-full shrink-0 lg:block lg:sticky lg:top-8 lg:w-[400px]">{body}</aside>

      {/* Mobile: sticky bottom bar + full-height sheet running the exact
          same state machine/props -- never a separate mobile booking
          engine. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <span className="tabular-nums-brand text-sm font-medium text-[var(--color-text)]">
            {stage === "select" ? (startingPrice ?? "") : ""}
          </span>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-full bg-[var(--color-brand)] px-6 text-sm font-medium text-[var(--color-on-brand)]"
          >
            {MOBILE_BAR_LABEL[stage]}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close"
            onClick={closeMobileSheet}
            className="absolute inset-0 bg-black/40"
          />
          <div
            ref={sheetRef}
            className="relative z-10 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[var(--radius-card)] bg-[var(--color-bg)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-muted)]">Book a session</span>
              <button
                type="button"
                onClick={closeMobileSheet}
                aria-label="Close booking sheet"
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--color-mist)]"
              >
                <Icon name="close" decorative />
              </button>
            </div>
            {(stage === "intake_review" || stage === "payment") && snapshot?.booking.hold_expires_at ? (
              <p className="mb-3 text-xs text-[var(--color-text-muted)]">
                Closing this won&apos;t cancel your reserved time -- reopen it anytime before it expires.
              </p>
            ) : null}
            {body}
          </div>
        </div>
      ) : null}
    </>
  );
}
