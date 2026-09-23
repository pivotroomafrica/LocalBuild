"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { signOutAction } from "@/lib/auth/actions";

export type NavLink = { href: string; label: string };

type Props = {
  navLinks: NavLink[];
  isLoggedIn: boolean;
};

/**
 * Compact mobile header (guideline section 20): logo + a single
 * account/menu control, never the desktop links squeezed inline. Opens a
 * real navigation drawer/sheet, not an overflow row.
 */
export function MobileNav({ navLinks, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text)]"
      >
        <Icon name="menu" size={24} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--color-ink)]/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative flex h-full w-full max-w-xs flex-col gap-1 bg-[var(--color-surface)] p-6"
          >
            <div className="mb-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-text)]"
              >
                <Icon name="close" size={24} />
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-[var(--radius-input)] px-3 py-3 text-base font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto flex flex-col gap-3 border-t border-[var(--color-border)] pt-6">
              {isLoggedIn ? (
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-[var(--radius-input)] px-3 py-3 text-left text-base font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                  >
                    Log out
                  </button>
                </form>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    onClick={() => setOpen(false)}
                    className="rounded-[var(--radius-input)] px-3 py-3 text-base font-medium text-[var(--color-text)] hover:bg-[var(--color-bg)]"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/auth/signup"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-brand)] px-7 text-sm font-medium text-white"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
