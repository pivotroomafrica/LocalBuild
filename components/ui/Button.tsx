import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "tertiary";
  /** 52px hero size vs. the 48px default -- guideline section 09. */
  size?: "default" | "hero";
  isLoading?: boolean;
  loadingText?: string;
};

/**
 * Intro-style pill buttons. Height 48 (52 in a hero). Primary is the ink
 * pill with a soft lift on hover; it flips to white inside an `.on-ink`
 * section (see globals.css) since both read the same --color-brand token.
 */
export function Button({
  variant = "primary",
  size = "default",
  isLoading = false,
  loadingText = "Saving...",
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  const base =
    "inline-flex w-full items-center justify-center gap-2 rounded-full px-7 text-[14.5px] font-bold tracking-[-0.01em] transition-all disabled:cursor-not-allowed disabled:opacity-60";
  const heightClass = size === "hero" ? "h-[52px]" : "h-12";
  const styles =
    variant === "primary"
      ? "bg-[var(--color-brand)] text-[var(--color-on-brand)] shadow-[0_4px_14px_rgba(20,19,24,0.18)] hover:bg-[var(--color-brand-hover)] enabled:hover:-translate-y-px"
      : variant === "secondary"
        ? "border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg)]"
        : "bg-transparent text-[var(--color-text)] underline decoration-[var(--color-border)] underline-offset-4 hover:decoration-[var(--color-text)]";

  return (
    <button
      className={`${base} ${heightClass} ${styles} ${className}`}
      style={{ transitionDuration: "var(--duration-fast)", transitionTimingFunction: "var(--ease-brand)" }}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? loadingText : children}
    </button>
  );
}
