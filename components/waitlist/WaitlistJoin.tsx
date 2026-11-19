"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { signUpForWaitlistAction, type WaitlistAccountState } from "@/lib/auth/actions";
import { NameFields } from "@/components/auth/NameFields";
import { TermsField } from "@/components/auth/TermsField";
import { CountryCityFields } from "@/components/ui/CountryCityFields";
import { PhoneField } from "@/components/ui/PhoneField";
import { TextField } from "@/components/ui/TextField";

type Who = "client" | "expert";

/**
 * Two buttons, "Join as a client" and "Join as an expert"; each opens its
 * sign-up form right here (no page change). Both create a real account
 * (signUpForWaitlistAction), so on launch day people just log in. The page
 * opens the expert form from elsewhere with a #join-expert link.
 */
export function WaitlistJoin() {
  const [who, setWho] = useState<Who | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  function open(next: Who) {
    setWho(next);
    requestAnimationFrame(() =>
      panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }

  // Links elsewhere on the page (#join-expert, #join-client) open the
  // matching form here, every time they're clicked.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href="#join-expert"], a[href="#join-client"]');
      if (!link) return;
      event.preventDefault();
      setWho(link.getAttribute("href") === "#join-expert" ? "expert" : "client");
      requestAnimationFrame(() =>
        document.getElementById("join-forms")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    };
    if (window.location.hash === "#join-expert") queueMicrotask(() => setWho("expert"));
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div className="wl-join" id="join-forms">
      <div className="wl-choice" role="group" aria-label="Join Pivotroom">
        <button
          type="button"
          className={who === "client" ? "wl-choice-btn on" : "wl-choice-btn"}
          aria-expanded={who === "client"}
          aria-controls="wl-panel"
          onClick={() => open("client")}
        >
          <span className="ms" aria-hidden="true">
            person_search
          </span>
          <span className="wl-choice-text">
            <strong>Join as a client</strong>
            <small>I want expert advice</small>
          </span>
        </button>
        <button
          type="button"
          className={who === "expert" ? "wl-choice-btn on" : "wl-choice-btn"}
          aria-expanded={who === "expert"}
          aria-controls="wl-panel"
          onClick={() => open("expert")}
        >
          <span className="ms" aria-hidden="true">
            workspace_premium
          </span>
          <span className="wl-choice-text">
            <strong>Join as an expert</strong>
            <small>I want to share my experience</small>
          </span>
        </button>
      </div>

      <div ref={panel} id="wl-panel">
        {/* A fresh form per choice, so switching never mixes the two. */}
        {who ? <JoinForm key={who} who={who} onClose={() => setWho(null)} /> : null}
      </div>
    </div>
  );
}

function JoinForm({ who, onClose }: { who: Who; onClose: () => void }) {
  const [state, action, pending] = useActionState<WaitlistAccountState, FormData>(signUpForWaitlistAction, {});

  if (state.status) {
    const expert = state.as === "expert";
    return (
      <div className="wl-done" role="status">
        <span className="wl-done-icon ms" aria-hidden="true">
          {state.status === "check-email" ? "mark_email_unread" : "celebration"}
        </span>
        <h3 className="wl-done-title">
          {expert ? "Your account is created" : `You're on the list${state.name ? `, ${state.name}` : ""}!`}
        </h3>
        <p className="wl-done-text">
          {state.status === "check-email" ? (
            <>
              We&apos;ve sent you an email. <strong>Open it and confirm your address</strong> (check spam too).{" "}
              {expert
                ? "The link takes you straight to building your expert profile with our AI."
                : "Your account is then ready: we'll email you the moment Pivotroom opens, and you just log in."}
            </>
          ) : (
            "Your account is ready. We'll email you the moment Pivotroom opens, and you just log in."
          )}
        </p>
      </div>
    );
  }

  const expert = who === "expert";
  return (
    <form action={action} className="wl-more">
      <input type="hidden" name="as" value={who} />
      <div className="wl-more-head">
        <div>
          <p className="wl-more-title">{expert ? "Join as an expert" : "Join the waitlist as a client"}</p>
          <p className="wl-more-sub">
            {expert
              ? "Create your account. After confirming your email, our AI helps you build your profile in about 10 minutes."
              : "Create your account now, and on launch day you just log in and book."}
          </p>
        </div>
        <button type="button" className="wl-close" onClick={onClose} aria-label="Close">
          <span className="ms" aria-hidden="true">
            close
          </span>
        </button>
      </div>

      <NameFields />
      <TextField label="Email" name="email" type="email" autoComplete="email" maxLength={254} required />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters. You'll use it to log in when we open."
        required
      />
      <PhoneField label="Phone number" required />
      <CountryCityFields required />
      {!expert ? (
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
            placeholder="e.g. Investing in agro-processing, getting a bank loan, entering the export market…"
          />
        </div>
      ) : null}
      {/* Hidden from people; bots fill it in. */}
      <div className="wl-hp" aria-hidden="true">
        <label htmlFor={`wl-website-${who}`}>Website</label>
        <input id={`wl-website-${who}`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <TermsField />
      {state.error ? (
        <p className="notice err" role="alert" style={{ margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="wl-btn-dark wl-btn-wide" disabled={pending}>
        {pending ? "Creating your account…" : expert ? "Create my expert account" : "Join the waitlist"}
      </button>
      <p className="wl-small">
        Already have an account? <a href={expert ? "/auth/login?next=/expert/onboarding" : "/auth/login"}>Log in</a>
      </p>
    </form>
  );
}
