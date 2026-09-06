import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-4 py-20 text-center">
      <p className="text-sm font-medium tracking-wide text-[var(--color-brand)]">PIVOTROOM</p>
      <h1 className="mt-4 max-w-lg text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">
        Talk to people who&apos;ve already been there.
      </h1>
      <p className="mt-4 max-w-sm text-base text-[var(--color-text-muted)]">
        Book one-to-one time with experienced professionals who&apos;ve navigated what
        you&apos;re facing now.
      </p>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:flex-row">
        <Link
          href="/auth/signup"
          className="inline-flex flex-1 items-center justify-center rounded-md bg-[var(--color-brand)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          Sign Up
        </Link>
        <Link
          href="/auth/login"
          className="inline-flex flex-1 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
        >
          Log In
        </Link>
      </div>
    </div>
  );
}
