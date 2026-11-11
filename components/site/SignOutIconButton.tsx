import { signOutAction } from "@/lib/auth/actions";

/** Round "log out" icon shown beside the account button. */
export function SignOutIconButton() {
  return (
    <form action={signOutAction} className="signout-form">
      <button type="submit" className="signout-icon" aria-label="Sign out" title="Sign out">
        <span className="ms" aria-hidden="true">
          logout
        </span>
      </button>
    </form>
  );
}
