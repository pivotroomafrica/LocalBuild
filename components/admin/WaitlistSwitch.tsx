"use client";

import { useActionState } from "react";
import { setWaitlistModeAction, type WaitlistSwitchState } from "@/lib/admin/waitlistActions";

/** The waitlist on/off switch, with a confirmation before it changes. */
export function WaitlistSwitch({ initialOn }: { initialOn: boolean }) {
  const [state, action, pending] = useActionState<WaitlistSwitchState, FormData>(setWaitlistModeAction, {});
  const on = state.on ?? initialOn;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const message = on
          ? "Turn the waitlist OFF? The full site opens to everyone again, and clients can book."
          : "Turn the waitlist ON? Visitors will only see the waitlist page, and new bookings are paused. Admins still see the full site.";
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={on ? "wls wls-on" : "wls"}
    >
      <input type="hidden" name="on" value={on ? "false" : "true"} />
      <div className="wls-text">
        <p className="wls-state">
          <span className="wls-dot" aria-hidden="true" />
          Waitlist is <strong>{on ? "ON" : "OFF"}</strong>
        </p>
        <p className="wls-help">
          {on
            ? "Visitors see only the waitlist page. Sign-in, expert onboarding and existing sessions still work. New bookings are paused. You (admin) see the full site."
            : "The full site is open to everyone. Turn the waitlist on to show only the waitlist page to visitors."}
        </p>
      </div>
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label="Waitlist mode"
        className="wls-toggle"
        disabled={pending}
      >
        <span className="wls-knob" />
      </button>
      {state.error ? (
        <p className="notice err" role="alert" style={{ margin: 0, flexBasis: "100%" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
