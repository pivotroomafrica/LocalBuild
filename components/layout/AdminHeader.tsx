import Link from "next/link";
import { signOutAction } from "@/lib/auth/actions";

export function AdminHeader() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/admin/experts" className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
            Pivotroom Admin
          </Link>
          <nav className="flex gap-4">
            <Link href="/admin/experts" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Experts
            </Link>
            <Link href="/admin/payments" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Payments
            </Link>
            <Link href="/admin/bookings" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Bookings
            </Link>
          </nav>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
