import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";

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
        <Link href="/" className="mb-8 flex justify-center" aria-label="Pivotroom home">
          <BrandLogo size={26} />
        </Link>
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-display text-xl font-bold text-[var(--color-text)]">{title}</h1>
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
