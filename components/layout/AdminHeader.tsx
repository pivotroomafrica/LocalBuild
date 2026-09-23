import Link from "next/link";
import { signOutAction } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/ui/BrandLogo";

const navLinkClasses = "text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]";

export function AdminHeader() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <Link href="/admin/experts" aria-label="Pivotroom admin home">
            <BrandLogo size={22} />
          </Link>
          <nav className="flex gap-5">
            <Link href="/admin/experts" className={navLinkClasses}>
              Experts
            </Link>
            <Link href="/admin/payments" className={navLinkClasses}>
              Payments
            </Link>
            <Link href="/admin/bookings" className={navLinkClasses}>
              Bookings
            </Link>
          </nav>
        </div>
        <form action={signOutAction}>
          <button type="submit" className={navLinkClasses}>
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
