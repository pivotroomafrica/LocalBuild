import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";

/** The real reply-to address the transactional emails already use, if it's
 * configured -- never a made-up support address. Accepts either a bare
 * address or "Name <address>". */
function contactEmail(): string | null {
  const raw = process.env.PIVOTROOM_REPLY_TO?.trim();
  if (!raw) return null;
  const email = raw.match(/<([^>]+)>/)?.[1] ?? raw;
  return email.includes("@") ? email : null;
}

/** Only real destinations: there are no Privacy/Terms/About pages yet, so
 * there are no links to them. */
export function SiteFooter({ categories }: { categories: string[] }) {
  const email = contactEmail();

  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-top">
          <div className="footer-brand">
            <BrandLogo size={26} className="text-white" />
            <p className="footer-tagline">
              Book 1-on-1 time with experienced founders, executives and operators who&apos;ve already solved the
              problems you&apos;re facing.
            </p>
            <Link href="/become-an-expert" className="footer-cta-btn">
              Apply as an Expert
            </Link>
          </div>

          <div className="footer-links-grid">
            {categories.length > 0 ? (
              <div>
                <h4 className="footer-col-title">Explore</h4>
                <ul className="footer-col-links">
                  {categories.slice(0, 5).map((name) => (
                    <li key={name} className="footer-link-item">
                      <Link href={`/experts?category=${encodeURIComponent(name)}`}>{name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <h4 className="footer-col-title">Company</h4>
              <ul className="footer-col-links">
                <li className="footer-link-item">
                  <Link href="/#how-it-works">How It Works</Link>
                </li>
                <li className="footer-link-item">
                  <Link href="/experts">Browse Experts</Link>
                </li>
                <li className="footer-link-item">
                  <Link href="/become-an-expert">Become an Expert</Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="footer-col-title">Account</h4>
              <ul className="footer-col-links">
                <li className="footer-link-item">
                  <Link href="/auth/login">Log in</Link>
                </li>
                <li className="footer-link-item">
                  <Link href="/auth/signup">Sign up</Link>
                </li>
                {email ? (
                  <li className="footer-link-item">
                    <a href={`mailto:${email}`}>{email}</a>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">© {new Date().getFullYear()} Pivotroom.Africa. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
