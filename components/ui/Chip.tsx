import type { ButtonHTMLAttributes } from "react";

/**
 * Selection chip (guideline section 09/12) -- duration/format/date/time
 * pickers, category filters. Radius 8px. Selected chip is the only place
 * blue fills a shape (section 12): unselected stays a quiet outline, so
 * blue never competes with itself across a row of chips.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

export function Chip({ selected = false, className = "", children, ...rest }: Props) {
  const styles = selected
    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]";

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex items-center justify-center rounded-[var(--radius-chip)] border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      style={{ transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-brand)" }}
      {...rest}
    >
      {children}
    </button>
  );
}
