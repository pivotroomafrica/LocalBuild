"use client";

import { useActionState, useId, useRef, useState } from "react";
import { joinWaitlistAction, type WaitlistState } from "@/lib/waitlist/actions";
import { CountryCityFields } from "@/components/ui/CountryCityFields";
import { PhoneField } from "@/components/ui/PhoneField";

/**
 * Two steps in one form: the email (a pill, like most waitlists), then the
 * rest of the details open underneath. Then "you're on the list".
 */
export function WaitlistForm() {
  const id = useId();
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlistAction, {});
  const [step, setStep] = useState<1 | 2>(1);
  const nameRef = useRef<HTMLInputElement>(null);

  if (state.joined) {
    return (
      <div className="wl-done" role="status">
        <span className="wl-done-icon ms" aria-hidden="true">
          {state.joined === "already" ? "task_alt" : "celebration"}
        </span>
        <h3 className="wl-done-title">
          {state.joined === "already"
            ? "You're already on the list"
            : `You're on the list${state.name ? `, ${state.name}` : ""}!`}
        </h3>
        <p className="wl-done-text">
          {state.joined === "already"
            ? "That email is already registered. We'll let you know as soon as Pivotroom opens."
            : "We'll email you as soon as Pivotroom opens. Nothing else to do for now."}
        </p>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="wl-form"
      onSubmit={(event) => {
        if (step === 1) {
          // The email is checked by the browser first (type=email, required).
          event.preventDefault();
          setStep(2);
          requestAnimationFrame(() => nameRef.current?.focus());
        }
      }}
    >
      <div className="wl-email">
        <label className="sr-only" htmlFor={`${id}-email`}>
          Email
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          inputMode="email"
          placeholder="Your email"
        />
        {step === 1 ? (
          <button type="submit" className="wl-btn-dark">
            Join waitlist
          </button>
        ) : null}
      </div>

      {step === 2 ? (
        <div className="wl-more">
          <p className="wl-more-title">Almost there. A few details so we can reach you:</p>
          <div className="field">
            <label className="label" htmlFor={`${id}-name`}>
              Full name
            </label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              name="full_name"
              className="input"
              required
              maxLength={120}
              autoComplete="name"
            />
          </div>
          <PhoneField label="Phone (optional)" />
          <CountryCityFields required />
          <div className="field">
            <label className="label" htmlFor={`${id}-interest`}>
              What would you like help with? <span className="wl-optional">(optional)</span>
            </label>
            <textarea
              id={`${id}-interest`}
              name="interest"
              className="input"
              rows={3}
              maxLength={1000}
              placeholder="e.g. Investing in agro-processing, getting a bank loan, entering the export market…"
            />
          </div>
          {/* Hidden from people; bots fill it in. */}
          <div className="wl-hp" aria-hidden="true">
            <label htmlFor={`${id}-website`}>Website</label>
            <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
          </div>
          {state.error ? (
            <p className="notice err" role="alert" style={{ margin: 0 }}>
              {state.error}
            </p>
          ) : null}
          <button type="submit" className="wl-btn-dark wl-btn-wide" disabled={pending}>
            {pending ? "Adding you…" : "Join the waitlist"}
          </button>
          <p className="wl-small">We&apos;ll only use your details to tell you when we open.</p>
        </div>
      ) : null}
    </form>
  );
}
