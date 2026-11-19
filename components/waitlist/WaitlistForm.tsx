"use client";

import { useActionState } from "react";
import { joinWaitlistAction, type WaitlistState } from "@/lib/waitlist/actions";
import { CountryCityFields } from "@/components/ui/CountryCityFields";
import { PhoneField } from "@/components/ui/PhoneField";

export function WaitlistForm() {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlistAction, {});

  if (state.joined) {
    return (
      <div className="wl-done" role="status">
        <span className="wl-done-icon ms" aria-hidden="true">
          {state.joined === "already" ? "task_alt" : "celebration"}
        </span>
        <h3 className="wl-done-title">
          {state.joined === "already" ? "You're already on the list" : `You're on the list${state.name ? `, ${state.name}` : ""}!`}
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
    <form action={action} className="wl-form" noValidate={false}>
      <div className="field">
        <label className="label" htmlFor="wl-name">
          Full name
        </label>
        <input id="wl-name" name="full_name" className="input" required maxLength={120} autoComplete="name" />
      </div>
      <div className="field">
        <label className="label" htmlFor="wl-email">
          Email
        </label>
        <input
          id="wl-email"
          name="email"
          type="email"
          className="input"
          required
          maxLength={254}
          autoComplete="email"
          inputMode="email"
        />
      </div>
      <PhoneField label="Phone (optional)" />
      <CountryCityFields required />
      <div className="field">
        <label className="label" htmlFor="wl-interest">
          What would you like help with? <span className="wl-optional">(optional)</span>
        </label>
        <textarea
          id="wl-interest"
          name="interest"
          className="input"
          rows={3}
          maxLength={1000}
          placeholder="e.g. Getting a bank loan for my business, entering the export market…"
        />
      </div>
      {/* Hidden from people; bots fill it in. */}
      <div className="wl-hp" aria-hidden="true">
        <label htmlFor="wl-website">Website</label>
        <input id="wl-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.error ? (
        <p className="notice err" role="alert" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-ink lg wl-submit" disabled={pending}>
        {pending ? "Adding you…" : "Join the waitlist"}
      </button>
      <p className="wl-small">We&apos;ll only use your details to tell you when we open.</p>
    </form>
  );
}
