import type { ButtonHTMLAttributes } from "react";

/**
 * Selection chip -- duration/format/date/time pickers, category filters.
 * Intro's category-pill look: quiet outline, dark ink pill when selected.
 */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

export function Chip({ selected = false, className = "", children, ...rest }: Props) {
  const styles = selected
    ? "border-[var(--color-text)] bg-[var(--color-text)] text-white shadow-[0_4px_14px_rgba(20,19,24,0.22)]"
    : "border-[#eae4d7] bg-[var(--color-surface)] text-[#3f3c47] hover:border-[#2b2832] hover:bg-[var(--color-bg)]";

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex items-center justify-center rounded-full border-[1.5px] px-4 py-2 text-[13.5px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      style={{ transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-brand)" }}
      {...rest}
    >
      {children}
    </button>
  );
}
