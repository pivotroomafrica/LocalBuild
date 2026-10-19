import Link from "next/link";
import { SiteLogo } from "@/components/site/SiteChrome";

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
 * Auth screens (sign in, create account, password reset) in the website
 * design: a plain header, one centred column, no card.
 */
export function AuthShell({ title, subtitle, tab, query = "", children, footer }: Props) {
  return (
    <div className="pr flex min-h-screen flex-col">
      <header className="pr-head">
        <div className="wrap bar">
          <Link href="/" className="logo" aria-label="Pivotroom home">
            <SiteLogo />
          </Link>
          <Link href="/become-an-expert" style={{ fontSize: 15 }}>
            Are you an expert?
          </Link>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-5" style={{ paddingBlock: "clamp(48px, 9vh, 104px) 80px" }}>
        <div className="stack w-full" style={{ maxWidth: 420, gap: 32 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h1 className="d" style={{ margin: 0, fontSize: "clamp(32px, 3.4vw, 44px)", lineHeight: 1.05, letterSpacing: "-0.025em" }}>
              {title}
            </h1>
            {subtitle ? (
              <p className="muted" style={{ margin: 0, fontSize: 17 }}>
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
      </main>
    </div>
  );
}
