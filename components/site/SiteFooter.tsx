import Link from "next/link";
import { SiteLogo } from "@/components/site/SiteChrome";

/** Public footer (website design). "Gift a session" is left out on purpose:
 * that feature doesn't exist. Payouts are explained in the expert terms. */
export function SiteFooter() {
  return (
    <footer className="pr-foot ink">
      <div className="wrap in">
        <div className="top">
          <div className="brand">
            <SiteLogo tone="white" />
            <span>One hour with someone whose time you couldn&apos;t otherwise get.</span>
          </div>
          <div className="cols">
            <div className="col">
              <span>Clients</span>
              <Link href="/experts">Find an expert</Link>
              <Link href="/#how">How it works</Link>
              <Link href="/help">Help and FAQ</Link>
            </div>
            <div className="col">
              <span>Experts</span>
              <Link href="/become-an-expert">Apply</Link>
              <Link href="/expert-terms">Expert terms</Link>
              <Link href="/expert-terms#payouts">Payouts</Link>
            </div>
            <div className="col">
              <span>Company</span>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
          </div>
        </div>
        <div className="base">
          <span>© {new Date().getFullYear()} Pivotroom · Modern Ethiopia Marketing PLC · Addis Ababa</span>
          <span>Payments by Chapa · Sessions on Google Meet or in person</span>
        </div>
      </div>
    </footer>
  );
}
