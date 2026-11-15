import Link from "next/link";
import { SiteLogo } from "@/components/site/SiteChrome";
import { getDirectoryForRequest } from "@/lib/public/cached";

type Props = {
  title: string;
  subtitle?: string;
  /** Shows the Sign in / Create account switch on those two screens. */
  tab?: "login" | "signup";
  /** Carried across the switch so a booking or `next` redirect survives. */
  query?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/**
 * Auth screens (sign in, create account, password reset, finish profile).
 * A moving gradient fills the page; the form sits on a solid white card.
 * Laptops and up: the brand message (live expert faces) on the gradient to
 * the left, the form card on the right. Phones: header plus the card.
 */
/** Sign-up that continues straight into the expert application. */
const EXPERT_SIGNUP = `/auth/signup?next=${encodeURIComponent("/expert/onboarding")}`;

export async function AuthShell({ title, subtitle, tab, query = "", children, footer }: Props) {
  // Arrived from "Become an expert" (or the link below): say so on the form.
  const expertIntent = decodeURIComponent(query).includes("next=/expert/");
  const shownSubtitle =
    tab === "signup" && expertIntent ? "Share what you know and get paid for your time." : subtitle;
  const experts = await getDirectoryForRequest();
  const faces = experts.filter((expert) => expert.photoUrl).slice(0, 4);

  return (
    <div className="pr auth-page flex min-h-screen flex-col">
      <div className="auth-bg" aria-hidden="true">
        <span className="auth-blob b1" />
        <span className="auth-blob b2" />
        <span className="auth-blob b3" />
      </div>
      <header className="pr-head auth-head">
        <div className="wrap bar">
          <Link href="/" className="logo" aria-label="Pivotroom home">
            <SiteLogo />
          </Link>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          <aside className="auth-art" aria-hidden="true">
            <Link href="/" className="auth-art-logo" tabIndex={-1}>
              <SiteLogo tone="white" />
            </Link>
            <div className="auth-art-copy">
              {faces.length >= 3 ? (
                <div className="auth-faces">
                  {faces.map((expert) => (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                    <img key={expert.slug} src={expert.photoUrl!} alt="" />
                  ))}
                  <span>Vetted experts, ready when you are</span>
                </div>
              ) : null}
              <p className="auth-art-kicker">Pivotroom</p>
              <p className="auth-art-title">One hour with someone who has already solved it.</p>
              <p className="auth-art-sub">
                Vetted experts across Ethiopia. Prices up front. Pay securely with Chapa or bank transfer.
              </p>
            </div>
          </aside>

          <div className="auth-form">
            <div className="stack w-full auth-stack" style={{ maxWidth: 400 }}>
              <div className="stack" style={{ gap: 8 }}>
                <h1 className="d auth-title">{title}</h1>
                {shownSubtitle ? (
                  <p className="muted auth-sub" style={{ margin: 0, fontSize: 16 }}>
                    {shownSubtitle}
                  </p>
                ) : null}
              </div>
              {tab ? (
                <nav className="seg" aria-label="Account">
                  <Link href={`/auth/login${query}`} aria-current={tab === "login" ? "page" : undefined}>
                    Sign in
                  </Link>
                  <Link href={`/auth/signup${query}`} aria-current={tab === "signup" ? "page" : undefined}>
                    Create account
                  </Link>
                </nav>
              ) : null}
              {tab === "signup" && expertIntent ? (
                <div className="auth-note">
                  <span className="ms" aria-hidden="true">
                    workspace_premium
                  </span>
                  <span>
                    <strong>You&apos;re joining as an expert.</strong> Create your account first, then you&apos;ll set up
                    your expert profile.{" "}
                    <Link href="/auth/signup">Just booking? Create a client account</Link>
                  </span>
                </div>
              ) : null}
              <div>{children}</div>
              {footer ? (
                <div className="muted" style={{ textAlign: "center", fontSize: 15 }}>
                  {footer}
                </div>
              ) : null}
              {tab === "signup" && !expertIntent ? (
                <Link href={EXPERT_SIGNUP} className="auth-expert">
                  <span className="ms" aria-hidden="true">
                    workspace_premium
                  </span>
                  <span>
                    <strong>Are you an expert?</strong>
                    <span>Sign up as an expert and set up your profile</span>
                  </span>
                  <span className="ms af" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              ) : null}
              {tab === "login" ? (
                <p className="auth-expert-line">
                  Experts sign in here too, with the same account. New expert?{" "}
                  <Link href={EXPERT_SIGNUP}>Apply to join</Link>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
