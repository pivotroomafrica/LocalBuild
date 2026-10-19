import Link from "next/link";
import { SiteLogo } from "@/components/site/SiteChrome";
import { SiteFooter } from "@/components/site/SiteFooter";
import { NotFoundContent } from "@/components/site/NotFoundContent";

export const metadata = { title: "Page not found — Pivotroom" };

/** Any URL that matches no route. Static, so it carries a plain header
 * rather than the signed-in-aware public one. */
export default function NotFound() {
  return (
    <div className="pr flex min-h-screen flex-col">
      <header className="pr-head">
        <div className="wrap bar">
          <Link href="/" className="logo" aria-label="Pivotroom home">
            <SiteLogo />
          </Link>
          <nav aria-label="Main">
            <Link href="/experts">Find an expert</Link>
            <Link href="/become-an-expert">Become an expert</Link>
            <Link href="/about">About</Link>
          </nav>
          <Link href="/match" className="btn btn-ink hide-sm">
            Get matched{" "}
            <span className="ms af" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <NotFoundContent />
      </main>
      <SiteFooter />
    </div>
  );
}
