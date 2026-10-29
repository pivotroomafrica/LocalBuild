import { switchAccountAction } from "@/lib/auth/actions";

/** Shown instead of "not found" when a session link from an email is
 * opened while signed in to an account that isn't part of that session. */
export function NotYourSession({ email, returnTo }: { email: string | null; returnTo: string }) {
  return (
    <div className="stack" style={{ gap: 16, maxWidth: "60ch" }}>
      <h1 className="ws-h1">This session isn&apos;t on this account</h1>
      <p className="muted" style={{ margin: 0 }}>
        You&apos;re signed in{email ? ` as ${email}` : ""}. Session links in our emails open for the account the email
        was sent to. Sign in with that account and we&apos;ll bring you straight back here.
      </p>
      <form action={switchAccountAction}>
        <input type="hidden" name="next" value={returnTo} />
        <button type="submit" className="btn btn-ink md">
          Sign in with another account
        </button>
      </form>
    </div>
  );
}
