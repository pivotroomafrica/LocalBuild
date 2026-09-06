import Link from "next/link";
import { signOutAction } from "@/lib/auth/actions";

export function DashboardHeader() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/dashboard/profile" className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
          Pivotroom
        </Link>
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
