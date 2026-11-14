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
 * Desktop: one card split into a branded panel (live expert faces) and the
 * form. Phones: the plain header and a single centred column.
 */
export async function AuthShell({ title, subtitle, tab, query = "", children, footer }: Props) {
  const experts = await getDirectoryForRequest();
  const faces = experts.filter((expert) => expert.photoUrl).slice(0, 4);

  return (
    <div className="pr auth-page flex min-h-screen flex-col">
      <header className="pr-head auth-head">
        <div className="wrap bar">
          <Link href="/" className="logo" aria-label="Pivotroom home">
            <SiteLogo />
          </Link>
          <Link href="/become-an-expert" style={{ fontSize: 15 }}>
            Are you an expert?
          </Link>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          <aside className="auth-art" aria-hidden="true">
            <span className="auth-blob b1" />
            <span className="auth-blob b2" />
            <span className="auth-blob b3" />
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
            <Link href="/become-an-expert" className="auth-corner">
              Are you an expert?
            </Link>
            <div className="stack w-full" style={{ maxWidth: 400, gap: 28 }}>
              <div className="stack" style={{ gap: 8 }}>
                <h1 className="d auth-title">{title}</h1>
                {subtitle ? (
                  <p className="muted" style={{ margin: 0, fontSize: 16 }}>
                    {subtitle}
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
              <div>{children}</div>
              {footer ? (
                <div className="muted" style={{ textAlign: "center", fontSize: 15 }}>
                  {footer}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
