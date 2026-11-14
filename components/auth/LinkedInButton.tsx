import { oauthSignInAction } from "@/lib/auth/actions";

/** "Continue with LinkedIn". `next`: where to land after signing in. */
export function LinkedInButton({ next }: { next?: string | null }) {
  return (
    <form action={oauthSignInAction}>
      <input type="hidden" name="provider" value="linkedin_oidc" />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button type="submit" className="oauth-btn">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <rect width="24" height="24" rx="4" fill="#0A66C2" />
          <path
            fill="#ffffff"
            d="M7.1 9.6h2.4V18H7.1V9.6Zm1.2-3.8a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM11 9.6h2.3v1.2h.03c.32-.6 1.1-1.24 2.27-1.24 2.43 0 2.88 1.6 2.88 3.68V18h-2.4v-4.2c0-1-.02-2.28-1.39-2.28-1.39 0-1.6 1.08-1.6 2.2V18H11V9.6Z"
          />
        </svg>
        Continue with LinkedIn
      </button>
    </form>
  );
}

/** "or" line between the LinkedIn button and the email form. */
export function OrDivider() {
  return (
    <div className="or-divider" role="separator">
      <span>or with email</span>
    </div>
  );
}
