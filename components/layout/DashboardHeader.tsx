import Link from "next/link";
import { signOutAction } from "@/lib/auth/actions";
import { BrandLogo } from "@/components/ui/BrandLogo";

export function DashboardHeader() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5 sm:px-8">
        <Link href="/dashboard/profile" aria-label="Pivotroom home">
          <BrandLogo size={24} />
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
