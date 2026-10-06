import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

const POINTS = [
  "Every expert is reviewed before their profile goes live.",
  "Book a 1-on-1 session online or in person.",
  "Pay with Chapa or bank transfer, verified before you meet.",
];

/**
 * Auth screens (login, signup, password reset) in the intro design: a dark
 * hero panel on large screens, and the form card on the warm beige canvas.
 * Copy only states what the product actually does.
 */
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <aside className="relative hidden w-[44%] max-w-[620px] flex-col justify-between overflow-hidden bg-[#121116] px-12 py-10 text-white lg:flex">
        <div aria-hidden="true" className="hero-glow-1" />
        <div aria-hidden="true" className="hero-glow-2" />

        <Link href="/" className="relative w-fit" aria-label="Pivotroom home">
          <BrandLogo size={28} className="text-white" />
        </Link>

        <div className="relative">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-[#cfccd6]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            1-on-1 sessions with vetted experts
          </p>
          <h2 className="max-w-md text-[40px] font-extrabold leading-[1.08] tracking-[-0.035em]">
            Talk to someone who&apos;s{" "}
            <span className="font-serif font-normal italic text-[#f5d58a]">already been there.</span>
          </h2>
          <ul className="mt-8 flex flex-col gap-3.5">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[15px] text-[#cfccd6]">
                <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#93b4f8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-[#95929e]">© {new Date().getFullYear()} Pivotroom.Africa</p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="mb-8 flex justify-center text-[var(--color-text)] lg:hidden" aria-label="Pivotroom home">
            <BrandLogo size={28} />
          </Link>
          <div className="rounded-[26px] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 shadow-[var(--shadow-raised)] sm:p-9">
            <div className="mb-7">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--color-text)]">{title}</h1>
              {subtitle ? <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">{subtitle}</p> : null}
            </div>
            {children}
          </div>
          {footer ? <div className="mt-6 text-center text-sm text-[var(--color-text-muted)]">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
