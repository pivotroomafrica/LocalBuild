import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Container } from "@/components/ui/Container";

const linkClasses = "text-sm text-[var(--color-accent-on-ink)] hover:text-white";

/**
 * Restrained public footer (guideline section 11/21): only real
 * destinations. There is no About/Terms/Privacy/Contact page in the
 * frozen product, so this deliberately has no "Legal"/"Support" columns
 * to fill -- just the two real public routes plus the auth entry points,
 * on an ink ground (the white -> mist -> ink rhythm's final step).
 */
export function PublicFooter() {
  return (
    <footer className="on-ink">
      <Container className="flex flex-col gap-8 py-16 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <BrandLogo size={24} />
          <p className="max-w-xs text-sm text-[var(--color-slate-dark)]">
            Talk to someone who&apos;s already been there.
          </p>
        </div>

        <nav className="flex flex-col gap-3 sm:items-end">
          <Link href="/experts" className={linkClasses}>
            Browse experts
          </Link>
          <Link href="/become-an-expert" className={linkClasses}>
            Become an expert
          </Link>
          <Link href="/auth/login" className={linkClasses}>
            Log in
          </Link>
        </nav>
      </Container>
      <Container className="border-t border-[var(--color-line-dark)] py-6">
        <p className="text-xs text-[var(--color-slate-dark)]">
          © {new Date().getFullYear()} Pivotroom.Africa
        </p>
      </Container>
    </footer>
  );
}
