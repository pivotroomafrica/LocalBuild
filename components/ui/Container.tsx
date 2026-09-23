import type { ReactNode } from "react";

/**
 * The Pivotroom grid container (guideline section 07): max width ~1440px,
 * responsive gutters (20px mobile, 32px tablet, 64px desktop) via
 * padding-inline (a logical property, so it holds under RTL without a
 * rebuild -- guideline section 06/18). The container itself can be wide;
 * text measures are constrained separately, per component, not here.
 */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-[var(--container-max)] px-5 sm:px-8 lg:px-16 ${className}`}
    >
      {children}
    </div>
  );
}
