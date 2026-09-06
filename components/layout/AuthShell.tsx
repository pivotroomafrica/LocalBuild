import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-lg font-semibold tracking-tight text-[var(--color-text)]">
          Pivotroom
        </Link>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
            {subtitle ? (
              <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">{subtitle}</p>
            ) : null}
          </div>
          {children}
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-[var(--color-text-muted)]">{footer}</div> : null}
      </div>
    </div>
  );
}
